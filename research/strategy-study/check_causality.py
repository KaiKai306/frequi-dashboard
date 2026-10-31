"""Compare every indicator/signal prefix across all 21 variants and both pairs."""
from pathlib import Path
import json,sys
import pandas as pd
sys.path.insert(0,'/src/strategies')
import StudyStrategies as strategies
from run_matrix import FAMILIES,TIMEFRAMES
w=Path('/work');config=json.loads((w/'config-s100.json').read_text());checks=[]
for timeframe in TIMEFRAMES:
    for family in FAMILIES:
        cls=getattr(strategies,f'{family}Study{timeframe}');strategy=cls(dict(config,timeframe=timeframe))
        for pair in ['BTC','ETH']:
            data=pd.read_feather(w/f'data/{pair}_USDT-{timeframe}.feather')
            def evaluate(frame):
                frame=strategy.populate_indicators(frame.copy(),{'pair':pair+'/USDT'})
                frame=strategy.populate_entry_trend(frame,{'pair':pair+'/USDT'})
                return strategy.populate_exit_trend(frame,{'pair':pair+'/USDT'})
            full=evaluate(data)
            cuts=sorted({max(strategy.startup_candle_count+100,int(len(data)*fraction)) for fraction in [.1,.25,.5,.75,.95]})
            for cut in cuts:
                assert cut<len(data)
                short=evaluate(data.iloc[:cut]);pd.testing.assert_frame_equal(full.iloc[:cut].reset_index(drop=True),short.reset_index(drop=True),check_exact=False,rtol=1e-12,atol=1e-12)
                checks.append({'strategy':cls.__name__,'pair':pair+'/USDT','rows':cut,'passed':True})
            print(json.dumps({'strategy':cls.__name__,'pair':pair,'prefixes':len(cuts),'passed':True}),flush=True)
(w/'causal-check.json').write_text(json.dumps({'passed':True,'variants':21,'checks':checks},indent=2)+'\n')
