"""Frozen 7 families x 3 timeframes x 3 stakes x 3 periods x 2 costs."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import argparse,datetime,hashlib,json,os,subprocess,time

IMAGE='freqtradeorg/freqtrade:2026.10@sha256:0cc4b6dc9b16e0516d27efae1765e925da7d6aea5c8f3c3825930ffe3098d7c7'
FAMILIES=['Sma','HorizonSma','Donchian','RsiBbands','AdxMomentum','Supertrend','EmaPullback']
TIMEFRAMES=['4h','1h','15m']
STAKES=[100,250,450]
PERIODS=[{'id':'2022-2023','label':'2022—2023','start':'2022-01-01','end':'2024-01-01'}, {'id':'2024-2025','label':'2024—2025','start':'2024-01-01','end':'2026-01-01'}, {'id':'2026-q1-q3','label':'2026年1—9月','start':'2026-01-01','end':'2026-10-01'}]
COSTS=[{'id':'base','label':'基准成本','fee':.001,'slippage':.0002,'effective_fee':.0012}, {'id':'stress','label':'成本压力','fee':.002,'slippage':.0005,'effective_fee':.0025}]


def docker_base(src,work):
    return ['sudo','-n','docker','run','--rm','--network','none','--user','1000:997','--memory','1024m','--cpus','1.5','--cap-drop','ALL','--security-opt','no-new-privileges:true','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','-e','PYTHONPATH=/home/ftuser/.local/lib/python3.14/site-packages','-e','NUMEXPR_MAX_THREADS=2','-e','OPENBLAS_NUM_THREADS=1','--mount',f'type=bind,src={src},dst=/src,readonly','--mount',f'type=bind,src={work},dst=/work','--entrypoint','python',IMAGE]


def task_id(tf,stake,period,cost):return f"{tf}-s{stake}-{period['id']}-{cost['id']}"


def run_task(src,work,tf,stake,period,cost):
    ident=task_id(tf,stake,period,cost);dest=work/'results'/ident;dest.mkdir(parents=True,exist_ok=True);dest.chmod(0o2770)
    taskfile=dest/'task.json'
    if taskfile.exists():
        old=json.loads(taskfile.read_text())
        if old['state']=='completed' and len(list(dest.glob('*.zip')))==1:return old
    cmd=docker_base(src,work)+['/src/offline_freqtrade.py','backtesting','--config',f'/work/config-s{stake}.json','--userdir','/work/user_data','--datadir','/work/data','--strategy-path','/src/strategies','--strategy-list',*[f'{f}Study{tf}' for f in FAMILIES],'--timerange',period['start'].replace('-','')+'-'+period['end'].replace('-',''),'--timeframe',tf,'--timeframe-detail','5m','--enable-protections','--fee',str(cost['effective_fee']),'--cache','none','--export','trades','--backtest-directory','/work/results/'+ident]
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
    with (dest/'engine.log').open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
    row={'id':ident,'timeframe':tf,'stake':stake,'period':period['id'],'cost':cost['id'],'state':'completed' if r.returncode==0 else 'failed','started_at':started,'duration_seconds':round(time.monotonic()-clock,2),'strategy_count':len(FAMILIES)}
    taskfile.write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True)
    assert r.returncode==0,'Study failed; inspect '+str(dest/'engine.log')
    return row


def main():
    a=argparse.ArgumentParser();a.add_argument('--work',type=Path,required=True);a.add_argument('--workers',type=int,default=1,choices=[1,2,3]);a.add_argument('--smoke',action='store_true');args=a.parse_args()
    os.umask(0o027);src=Path(__file__).resolve().parent;work=args.work.resolve();(work/'user_data').mkdir(exist_ok=True);(work/'user_data').chmod(0o2770)
    frozen=json.loads((work/'frozen.json').read_text())
    for name,expected in frozen['configs'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==expected,name
    for name,expected in frozen['sources'].items():assert hashlib.sha256((src/name).read_bytes()).hexdigest()==expected,name
    jobs=[(tf,stake,p,c) for tf in TIMEFRAMES for stake in STAKES for p in PERIODS for c in COSTS]
    if args.smoke:jobs=jobs[:1]
    tasks=[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(run_task,src,work,*job) for job in jobs]
        for f in as_completed(futures):tasks.append(f.result())
    output='smoke.json' if args.smoke else 'matrix.json';(work/output).write_text(json.dumps({'image':IMAGE,'families':FAMILIES,'timeframes':TIMEFRAMES,'stakes':STAKES,'periods':PERIODS,'costs':COSTS,'tasks':sorted(tasks,key=lambda x:x['id'])},indent=2)+'\n')


if __name__=='__main__':main()
