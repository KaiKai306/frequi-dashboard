"""Run official Freqtrade CLI with a pinned public-market snapshot, without network.

Only market discovery is replaced. Strategy, fees, precision, wallet, execution,
protections, reporting and bias analysis remain the official 2026.10 code.
The container must have --network=none and no account credentials mounted.
"""
from pathlib import Path
import json,sys,time
from freqtrade.exchange.exchange import Exchange

snapshot=json.loads(Path('/work/markets.json').read_text())
assert snapshot['exchange']=='binance' and {m['symbol'] for m in snapshot['markets']}=={'BTC/USDT','ETH/USDT'}
def frozen_markets(self,force=False,*,load_leverage_tiers=True):
    assert self.trading_mode.value=='spot'
    self._api.set_markets(snapshot['markets'])
    self._api_async.set_markets(snapshot['markets'])
    self._markets=self._api.markets
    self._last_markets_refresh=int(time.time()*1000)
Exchange.reload_markets=frozen_markets
from freqtrade.main import main
main(sys.argv[1:])
