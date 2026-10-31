"""Run on Japan; authenticate locally without exporting dashboard credentials."""
import base64, datetime, http.client, json, socket, sqlite3, subprocess, urllib.parse
from pathlib import Path

ROOT = Path('/opt/binance-quant')
BASE = 'quant.happykai.cn'
PRIMARY = '/preview/bot/api/v1/'
COMPARE = '/preview/bots/compare/api/v1/'


def main():
    assert socket.gethostname() == 'ser608738340395'
    secret = json.loads((ROOT / 'private/api-server.json').read_text())['api_server']
    authorization = 'Basic ' + base64.b64encode((secret['username'] + ':' + secret['password']).encode()).decode()

    def request(path, authenticated=True, method='GET'):
        connection = http.client.HTTPSConnection(BASE, timeout=20)
        try:
            connection.request(method, path, headers={'Authorization': authorization} if authenticated else {})
            response = connection.getresponse(); body = response.read(4_000_001)
            assert len(body) <= 4_000_000
            return response.status, json.loads(body) if response.status == 200 else None
        finally:
            connection.close()

    assert request(COMPARE + 'show_config', False)[0] == 401
    code, primary = request(PRIMARY + 'show_config'); assert code == 200
    code, compare = request(COMPARE + 'show_config'); assert code == 200
    for config in [primary, compare]:
        assert config['dry_run'] is True and config['trading_mode'] == 'spot' and config['state'] == 'running'
    assert primary['strategy'] == 'BaselineSmaTrend4h' and primary['timeframe'] == '4h'
    assert compare['strategy'] == 'PaperCompare1h' and compare['timeframe'] == '1h' and compare['max_open_trades'] == 2
    for endpoint in ['balance', 'status', 'profit', 'trades?limit=5', 'daily?timescale=3', 'logs?limit=5', 'whitelist', 'count']:
        code, data = request(COMPARE + endpoint); assert code == 200 and isinstance(data, (list, dict)), endpoint
    for pair in ['BTC/USDT', 'ETH/USDT']:
        code, data = request(COMPARE + 'pair_candles?' + urllib.parse.urlencode({'pair': pair, 'timeframe': '1h', 'limit': 10}))
        assert code == 200 and len(data['data']) >= 5 and 'close' in data['columns']
    # These methods and paths must stop at the fixed Caddy allowlist.
    for endpoint in ['start', 'stop', 'forceentry', 'forceexit', 'reload_config', 'blacklist']:
        assert request(COMPARE + endpoint, method='POST')[0] == 405
        if endpoint != 'blacklist': assert request(COMPARE + endpoint)[0] == 405
    assert request(COMPARE + 'show_config', method='HEAD')[0] == 405
    code, registry = request('/preview/backtests/paper-bots.json'); assert code == 200
    assert {bot['apiUrl'] for bot in registry['bots']} == {'/preview/bot', '/preview/bots/compare'}
    assert all(bot['startingCapital'] == 1000 for bot in registry['bots'])
    configs = [json.loads((ROOT / folder / 'config.json').read_text()) for folder in ['user_data', 'paper_compare']]
    for config in configs:
        assert config['dry_run'] is True and config['dry_run_wallet'] == 1000
        assert not config['exchange'].get('key') and not config['exchange'].get('secret')
    databases = [ROOT / folder / 'trades-dryrun.sqlite' for folder in ['user_data', 'paper_compare']]
    assert all(path.is_file() and not path.is_symlink() for path in databases)
    assert databases[0].stat().st_ino != databases[1].stat().st_ino
    rows = []
    for database in databases:
        connection = sqlite3.connect('file:' + str(database) + '?mode=ro', uri=True)
        try:
            assert connection.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
            rows.append(connection.execute('SELECT count(*), coalesce(sum(is_open),0) FROM trades').fetchone())
        finally: connection.close()
    container = json.loads(subprocess.check_output(['docker', 'inspect', 'binance-quant-paper-compare']))[0]
    assert not container['HostConfig']['PortBindings'] and not container['NetworkSettings']['Ports'].get('8080/tcp')
    mounts = container['Mounts']; sources = [mount['Source'] for mount in mounts]
    assert str(ROOT / 'user_data') not in sources
    assert not any('/root/.config/' in source or '/credentials/' in source for source in sources)
    print(json.dumps({'tested_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'two_spot_paper_bots_running': True, 'separate_virtual_wallets_and_databases': True, 'database_trade_counts': rows, 'fixed_read_only_gateway': True, 'compare_candles_available': True, 'no_new_public_port': True, 'no_exchange_credentials_mounted': True, 'dashboard_credentials_exported': False, 'real_orders_sent': False}))


if __name__ == '__main__': main()
