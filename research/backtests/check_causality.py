"""Compare indicator and signal values with and without future rows for all pairs."""
from pathlib import Path
import json,sys
import pandas as pd
sys.path.insert(0,'/src/strategies')
from BaselineSmaTrend4h import BaselineSmaTrend4h
from DonchianTrend4h import DonchianTrend4h
from RsiBbands4h import RsiBbands4h
config=json.loads(Path('/work/config.json').read_text());checks=[]
for cls in [BaselineSmaTrend4h,DonchianTrend4h,RsiBbands4h]:
    strategy=cls(config)
    for pair in ['BTC','ETH']:
        data=pd.read_feather(f'/work/data/{pair}_USDT-4h.feather')
        def evaluate(df):
            df=strategy.populate_indicators(df.copy(),{'pair':pair+'/USDT'})
            df=strategy.populate_entry_trend(df,{'pair':pair+'/USDT'})
            return strategy.populate_exit_trend(df,{'pair':pair+'/USDT'})
        full=evaluate(data)
        for cut in [300,600,2000,5000,10000]:
            short=evaluate(data.iloc[:cut]);pd.testing.assert_frame_equal(full.iloc[:cut].reset_index(drop=True),short.reset_index(drop=True),check_exact=False,rtol=1e-12,atol=1e-12)
            checks.append({'strategy':cls.__name__,'pair':pair+'/USDT','rows':cut,'passed':True})
Path('/work/causal-check.json').write_text(json.dumps({'passed':True,'checks':checks},indent=2)+'\n')
print(json.dumps({'causal_prefix_checks':len(checks),'passed':True}))
