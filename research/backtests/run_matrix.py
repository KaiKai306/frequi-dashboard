"""Run the frozen, network-isolated 3-strategy x 4-period x 2-cost experiment."""
from pathlib import Path
import argparse,datetime as dt,hashlib,json,subprocess,time

IMAGE='freqtradeorg/freqtrade:2026.10@sha256:0cc4b6dc9b16e0516d27efae1765e925da7d6aea5c8f3c3825930ffe3098d7c7'
PERIODS=[{'id':'2022-2023','label':'2022—2023','start':'2022-01-01','end':'2024-01-01'}, {'id':'2024-2025','label':'2024—2025','start':'2024-01-01','end':'2026-01-01'}, {'id':'2026-q1-q3','label':'2026年1—9月','start':'2026-01-01','end':'2026-10-01'}, {'id':'full','label':'完整历史区间','start':'2022-01-01','end':'2026-10-01'}]
COSTS=[{'id':'base','label':'基准成本','fee':.001,'slippage':.0002,'effective_fee':.0012}, {'id':'stress','label':'成本压力','fee':.002,'slippage':.0005,'effective_fee':.0025}]
STRATEGIES=[{'id':'BaselineSmaTrend4h','name':'双均线趋势','description':'SMA50 高于 SMA200 入场，反转退出；当前模拟基线。','parameters':{'SMA快线':50,'SMA慢线':200,'止损':'8%','冷却':'2根4h'}}, {'id':'DonchianTrend4h','name':'通道突破','description':'突破前20根高点且高于SMA200入场，跌破前10根低点或趋势退出。','parameters':{'突破周期':20,'退出周期':10,'趋势均线':200,'止损':'8%'}}, {'id':'RsiBbands4h','name':'RSI / 布林回归','description':'上升趋势中 RSI14<30 且跌破20根布林下轨入场，均值回归或48小时退出。','parameters':{'RSI周期':14,'超卖阈值':30,'布林周期':20,'标准差':2,'最长持有':'48小时'}}]

def docker_base(src,work):
    return ['sudo','-n','docker','run','--rm','--network','none','--user','1000:997','--memory','1800m','--cpus','1.5','--cap-drop','ALL','--security-opt','no-new-privileges:true','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','-e','PYTHONPATH=/home/ftuser/.local/lib/python3.14/site-packages','-e','NUMEXPR_MAX_THREADS=2','-e','OPENBLAS_NUM_THREADS=1','--mount',f'type=bind,src={src},dst=/src,readonly','--mount',f'type=bind,src={work},dst=/work','--entrypoint','python',IMAGE]

def main():
    a=argparse.ArgumentParser();a.add_argument('--work',type=Path,required=True);a.add_argument('--only-first',action='store_true');args=a.parse_args()
    src=Path(__file__).resolve().parent;work=args.work.resolve();tasks=[]
    import os
    os.umask(0o027)
    (work/'user_data').mkdir(exist_ok=True)
    for period in PERIODS:
        for cost in COSTS:
            task=period['id']+'-'+cost['id'];dest=work/'results'/task;dest.mkdir(parents=True,exist_ok=True);dest.chmod(0o2770)
            if list(dest.glob('*.zip')):continue
            cmd=docker_base(src,work)+['/src/offline_freqtrade.py','backtesting','--config','/work/config.json','--userdir','/work/user_data','--datadir','/work/data','--strategy-path','/src/strategies','--strategy-list',*[s['id'] for s in STRATEGIES],'--timerange',period['start'].replace('-','')+'-'+period['end'].replace('-',''),'--timeframe-detail','1h','--enable-protections','--fee',str(cost['effective_fee']),'--cache','none','--export','trades','--backtest-directory','/work/results/'+task]
            started=dt.datetime.now(dt.timezone.utc).isoformat();clock=time.monotonic()
            with (dest/'engine.log').open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
            result={'id':task,'period':period['id'],'cost':cost['id'],'state':'completed' if not r.returncode else 'failed','started_at':started,'duration_seconds':round(time.monotonic()-clock,2),'strategy_count':3}
            (dest/'task.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
            if r.returncode:raise SystemExit('Backtest failed; inspect '+str(dest/'engine.log'))
            tasks.append(result)
            if args.only_first:return
    (work/'matrix.json').write_text(json.dumps({'periods':PERIODS,'costs':COSTS,'strategies':STRATEGIES,'image':IMAGE,'tasks':[json.loads(p.read_text()) for p in sorted((work/'results').glob('*/task.json'))]},indent=2,ensure_ascii=False)+'\n')

if __name__=='__main__':main()
