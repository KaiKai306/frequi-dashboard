"""Run on the Japan node. Read dashboard auth locally; emit only safe assertions."""
import base64
import datetime
import hashlib
import http.client
import json
from pathlib import Path
import re
import socket
import sys
import time
import urllib.parse

BASE = 'https://quant.happykai.cn'
ROOT = Path('/opt/binance-quant')


def main():
    assert socket.gethostname() == 'ser608738340395'
    credentials = json.loads((ROOT / 'private/api-server.json').read_text())['api_server']
    authorization = 'Basic ' + base64.b64encode(
        (credentials['username'] + ':' + credentials['password']).encode('ascii')).decode('ascii')
    origin = urllib.parse.urlsplit(BASE)
    results = {'tested_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'origin': BASE, 'real_orders_sent': False, 'credentials_exported': False}

    def request(path, auth=False, method='GET', wrong=False):
        connection = http.client.HTTPSConnection(origin.hostname, timeout=20)
        headers = {}
        if auth:
            headers['Authorization'] = authorization
        if wrong:
            headers['Authorization'] = 'Basic ' + base64.b64encode(b'kai:invalid-preview-test').decode('ascii')
        started = time.monotonic()
        try:
            connection.request(method, path, headers=headers)
            response = connection.getresponse()
            body = response.read(4_000_001)
            assert len(body) <= 4_000_000
            status, response_headers = response.status, dict(response.getheaders())
            try:
                data = json.loads(body)
            except (ValueError, UnicodeDecodeError):
                data = None
            return status, data, body, {k.lower(): v for k, v in response_headers.items()}, round((time.monotonic()-started)*1000, 2)
        finally:
            connection.close()

    code, _, _, headers, _ = request('/preview')
    assert code == 308 and headers['location'] == '/preview/'
    code, _, html, headers, elapsed = request('/preview/')
    assert code == 200 and 'Happykai'.encode() in html and b'zh-CN' in html
    assert headers.get('cache-control') == 'no-store'
    assert "connect-src 'self'" in headers.get('content-security-policy', '')
    results['html'] = {'valid': True, 'tls_verified': True, 'elapsed_ms_on_japan': elapsed}
    assets = re.findall(rb'(?:src|href)="(/preview/assets/[^"]+)"', html)
    assert len(assets) >= 2
    results['assets'] = []
    for raw in assets:
        path = raw.decode('ascii')
        code, _, body, headers, elapsed = request(path)
        assert code == 200 and len(body) > 100 and 'immutable' in headers.get('cache-control', '')
        results['assets'].append({'path': path, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'elapsed_ms_on_japan': elapsed})
    assert request('/preview/assets/missing-test.js')[0] == 404
    protected = '/preview/bot/api/v1/show_config'
    assert request(protected)[0] == 401 and request(protected, wrong=True)[0] == 401
    code, config, _, _, _ = request(protected, auth=True)
    assert code == 200 and config['dry_run'] is True and config['trading_mode'] == 'spot'
    assert config['strategy'] == 'BaselineSmaTrend4h' and config['timeframe'] == '4h' and config['state'] == 'running'
    results['runtime'] = {k: config.get(k) for k in ['strategy', 'timeframe', 'state', 'dry_run', 'trading_mode', 'max_open_trades']}
    results['dashboard_authentication'] = True
    for endpoint in ['status', 'balance', 'profit', 'trades?limit=5', 'daily?timescale=3', 'logs?limit=5', 'whitelist', 'blacklist']:
        code, data, _, _, _ = request('/preview/bot/api/v1/' + endpoint, auth=True)
        assert code == 200 and isinstance(data, (list, dict)), endpoint
    results['read_endpoints'] = True
    results['candles'] = []
    for pair in ['BTC/USDT', 'ETH/USDT']:
        query = urllib.parse.urlencode({'pair': pair, 'timeframe': '4h', 'limit': 10})
        code, data, _, _, _ = request('/preview/bot/api/v1/pair_candles?' + query, auth=True)
        assert code == 200 and data['data']
        for key in ['close', 'sma50', 'sma200']:
            assert float(data['data'][-1][data['columns'].index(key)]) > 0
        results['candles'].append({'pair': pair, 'server_sma50_sma200': True})
    results['market'] = []
    for symbol in ['BTCUSDT', 'ETHUSDT']:
        query = '/preview/market/klines?' + urllib.parse.urlencode({'symbol': symbol, 'interval': '1h', 'limit': 5})
        assert request(query)[0] == 401 and request(query, wrong=True)[0] == 401
        code, data, _, _, _ = request(query, auth=True)
        assert code == 200 and isinstance(data, list) and len(data) == 5
        assert all(len(k) >= 6 and float(k[4]) > 0 for k in data)
        assert all(data[i+1][0]-data[i][0] == 3600000 for i in range(4))
        code, older, _, _, _ = request(query + '&endTime=' + str(data[0][0]-1), auth=True)
        assert code == 200 and len(older) == 5 and older[-1][0] < data[0][0]
        results['market'].append({'symbol': symbol, 'spot_hourly_and_history_valid': True})
    bad_queries = ['symbol=SOLUSDT&interval=1h&limit=5', 'symbol=BTCUSDT&interval=1h&limit=5&symbol=ETHUSDT',
                   'symbol=BTCUSDT&interval=1h&limit=5&url=https%3A%2F%2Fexample.com', 'symbol=BTCUSDT&interval=1h&limit=1001']
    assert all(request('/preview/market/klines?' + q, auth=True)[0] == 400 for q in bad_queries)
    # Denied by the preview gateway. These requests must never reach Freqtrade.
    for endpoint in ['start', 'stop', 'forceexit', 'reload_config', 'blacklist']:
        assert request('/preview/bot/api/v1/' + endpoint, auth=True, method='POST')[0] == 405
    assert request('/preview/bot/api/v1/blacklist', auth=True, method='DELETE')[0] == 405
    for path in ['/preview/api-proxy/api/v1/ping', '/preview/owner-api/test', '/preview/share-api/test']:
        assert request(path, auth=True)[0] == 404
    assert request('/')[0] == 200
    results['gateway_write_denials'] = True
    results['dynamic_proxy_denied'] = True
    results['invalid_market_queries_denied'] = True
    results['original_ui_reachable'] = True
    output = json.dumps(results, indent=2, ensure_ascii=False)
    if '--save' in sys.argv:
        Path('/root/ai-maint/2026-10-31/trellis-preview/public-verification.json').write_text(output + '\n')
    print(output)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not emit request headers, auth, response bodies, or exception repr.
        print(json.dumps({'verification': 'failed', 'error_type': type(error).__name__}))
        raise SystemExit(1)
