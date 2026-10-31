from pathlib import Path
import csv,json,subprocess,sys
import argparse,hashlib
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
s=Path(__file__).resolve().parent;w=args.work.resolve();sys.path.insert(0,str(s))
from run_matrix import docker_base,FAMILIES,TIMEFRAMES
frozen=json.loads((w/'frozen.json').read_text())
for name,expected in frozen['sources'].items():assert hashlib.sha256((s/name).read_bytes()).hexdigest()==expected
for name,expected in frozen['configs'].items():assert hashlib.sha256((w/name).read_bytes()).hexdigest()==expected
rows=[]
for tf in TIMEFRAMES:
 out=f'lookahead-{tf}.csv'
 command=docker_base(s,w)+['/src/offline_freqtrade.py','lookahead-analysis','--config','/work/config-s100.json','--userdir','/work/user_data','--datadir','/work/data','--strategy-path','/src/strategies','--strategy-list',*[f'{f}Study{tf}' for f in FAMILIES],'--timerange','20220101-20261001','--timeframe',tf,'--timeframe-detail','5m','--fee','0.0012','--minimum-trade-amount','5','--targeted-trade-amount','10','--lookahead-analysis-exportfilename','/work/'+out]
 command[command.index('--memory')+1]='1800m'
 with (w/f'lookahead-{tf}.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 assert r.returncode==0,tf
 current=list(csv.DictReader((w/out).open()));assert len(current)==7
 assert all(x['has_bias']=='False' and x['biased_entry_signals']=='0' and x['biased_exit_signals']=='0' and x['total_signals']=='10' and not x['biased_indicators'] for x in current),current
 rows.extend(current);print(json.dumps({'timeframe':tf,'variants':len(current),'status':'passed'}),flush=True)
(w/'lookahead-check.json').write_text(json.dumps({'status':'passed','signals_per_variant':10,'rows':rows},indent=2)+'\n')
