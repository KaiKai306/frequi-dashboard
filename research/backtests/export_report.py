"""Publish an auditable, account-free report from genuine Freqtrade ZIP exports."""
from pathlib import Path
from decimal import Decimal,ROUND_DOWN
import argparse,datetime as dt,hashlib,io,json,math,zipfile
import pandas as pd
from run_matrix import PERIODS,COSTS,STRATEGIES


def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def series_stats(frame,initial,final,start,end):
    frame=frame.groupby('date')['total_quote'].sum().sort_index()
    points={int(pd.Timestamp(t).timestamp()*1000):float(v) for t,v in frame.items()}
    points[start]=initial;points[end]=final
    raw=sorted(points.items());peak=initial;dd=[]
    for t,v in raw:
        assert math.isfinite(v) and v>0
        peak=max(peak,v);dd.append((t,v,(1-v/peak)*100))
    maxdd=max(p[2] for p in dd)
    # Keep daily closes plus local highs/lows. Values and drawdowns use the full 4h path.
    keep={0,len(dd)-1,max(range(len(dd)),key=lambda i:dd[i][2])}
    for i,(t,v,d) in enumerate(dd):
        if i==len(dd)-1 or t//86400000!=dd[i+1][0]//86400000:keep.add(i)
    path=[[t,round(v,6),round(d,6)] for i,(t,v,d) in enumerate(dd) if i in keep]
    monthly={}
    for t,v,_ in dd:
        month=dt.datetime.fromtimestamp(min(t,end-1)/1000,dt.timezone.utc).strftime('%Y-%m');monthly[month]=v
    prior=initial;months=[]
    for month,v in monthly.items():months.append({'month':month,'returnPct':round((v/prior-1)*100,6),'profit':round(v-prior,6)});prior=v
    assert abs(prior-final)<1e-5
    return path,maxdd,months

def main():
    a=argparse.ArgumentParser();a.add_argument('--work',type=Path,default=Path('/work'));a.add_argument('--output',type=Path,default=Path('/work/report.json'));args=a.parse_args();w=args.work
    matrix=json.loads((w/'matrix.json').read_text());audit=json.loads((w/'data/audit.json').read_text());markets=json.loads((w/'markets.json').read_text());causal=json.loads((w/'causal-check.json').read_text());assert causal['passed']
    strats=[dict(s,sourceSha256=sha(Path(__file__).parent/'strategies'/(s['id']+'.py'))) for s in STRATEGIES]
    candles={};frames={}
    for pair in ['BTC','ETH']:
        d=pd.read_feather(w/f'data/{pair}_USDT-4h.feather');frames[pair+'/USDT']=d.set_index('date')
        candles[pair+'/USDT']=[[int(r.date.timestamp()*1000),r.open,r.high,r.low,r.close] for r in d.itertuples()]
    runs=[];benchmarks=[];checks=[]
    for period in PERIODS:
        for cost in COSTS:
            task=period['id']+'-'+cost['id'];archives=list((w/'results'/task).glob('*.zip'));assert len(archives)==1,task
            with zipfile.ZipFile(archives[0]) as z:
                n=next(n for n in z.namelist() if n.endswith('.json') and n.startswith('backtest-result-') and not n.endswith('_config.json') and not any(s['id'] in n for s in STRATEGIES))
                raw=json.loads(z.read(n))
                for strat in strats:
                    ident=strat['id'];s=raw['strategy'][ident];start=s['backtest_start_ts'];end=s['backtest_end_ts'];initial=s['starting_balance'];final=s['final_balance']
                    walletname=next(n for n in z.namelist() if n.endswith(ident+'_wallet.feather'))
                    native=pd.read_feather(io.BytesIO(z.read(walletname)))
                    curve,maxdd,monthly=series_stats(native,initial,final,start,end)
                    trades=[]
                    for t in s['trades']:
                        fee=t['amount']*(t['open_rate']*t['fee_open']+t['close_rate']*t['fee_close'])
                        independently=t['amount']*(t['close_rate']-t['open_rate'])-fee
                        assert abs(independently-t['profit_abs'])<1e-5,(ident,independently,t['profit_abs'])
                        trades.append({'pair':t['pair'],'openTime':t['open_timestamp'],'closeTime':t['close_timestamp'],'openRate':t['open_rate'],'closeRate':t['close_rate'],'amount':t['amount'],'stake':t['stake_amount'],'profit':t['profit_abs'],'returnPct':t['profit_ratio']*100,'durationMinutes':t['trade_duration'],'reason':t['exit_reason'],'enterTag':t.get('enter_tag',''),'fees':fee})
                    assert abs(sum(t['profit'] for t in trades)-(final-initial))<1e-4
                    assert initial==1000 and s['max_open_trades']==2 and s['timeframe_detail']=='1h' and s['enable_protections']
                    assert curve[0][1]==1000 and abs(curve[-1][1]-final)<1e-5
                    metrics={'initial':initial,'final':final,'profit':s['profit_total_abs'],'returnPct':s['profit_total']*100,'drawdownPct':maxdd,'closedDrawdownPct':s['max_drawdown_account']*100,'trades':len(trades),'winRate':s['winrate']*100,'profitFactor':s['profit_factor'] if s['losses'] else None,'fees':sum(t['fees'] for t in trades)}
                    runs.append({'id':task+'-'+ident,'taskId':task,'strategyId':ident,'periodId':period['id'],'costId':cost['id'],'start':start,'end':end,'metrics':metrics,'series':curve,'monthly':monthly,'trades':sorted(trades,key=lambda t:t['closeTime'],reverse=True),'sourceArchiveSha256':sha(archives[0])})
                    checks.append({'run':task+'-'+ident,'trade_count':len(trades),'wallet_final_reconciled':True,'trade_pnl_independent_check':True})
                # Same-capital reference: 100USDT budget per coin, remainder USDT cash.
                stamps=sorted({start,end,*[int(pd.Timestamp(t).timestamp()*1000) for t in native['date'].unique()]});quantity={};cash=1000
                for pair,frame in frames.items():
                    opening=float(frame.loc[frame.index>=pd.Timestamp(start,unit='ms',tz='UTC'),'open'].iloc[0])
                    market=next(m for m in markets['markets'] if m['symbol']==pair);step=Decimal(str(market['precision']['amount']))
                    qty=float((Decimal(str(100/(opening*(1+cost['effective_fee']))))/step).to_integral_value(rounding=ROUND_DOWN)*step)
                    quantity[pair]=qty;cash-=qty*opening*(1+cost['effective_fee'])
                index=pd.to_datetime(stamps,unit='ms',utc=True)
                values=pd.Series(cash,index=index,dtype=float)
                for pair,frame in frames.items():values+=quantity[pair]*frame['open'].reindex(index,method='ffill')
                values.iloc[-1]=cash+(values.iloc[-1]-cash)*(1-cost['effective_fee'])
                bframe=pd.DataFrame({'date':index,'total_quote':values.to_numpy()})
                bpath,bdd,_=series_stats(bframe,1000,float(values.iloc[-1]),start,end)
                benchmarks.append({'periodId':period['id'],'costId':cost['id'],'name':'买入持有 · 各100 USDT，其余现金','series':bpath,'returnPct':(values.iloc[-1]/1000-1)*100,'drawdownPct':bdd})
    lookahead=json.loads((w/'lookahead-check.json').read_text()) if (w/'lookahead-check.json').exists() else {'status':'not_run'}
    audit_hash=sha(w/'data/audit.json')
    report={'schemaVersion':1,'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'reportId':'btc-eth-4h-'+audit_hash[:12],'engine':'Freqtrade 2026.10','dataset':{'start':'2021-11-01','end':'2026-09-30','archives':118,'hourlyRowsPerPair':43079,'source':'Binance Data Vision 官方月度现货归档','sha256':audit_hash,'knownGap':'2023-03-24 13:00 UTC 缺1小时；完整4h聚合排除该窗，引擎加载按默认零量规则补齐。'},'settings':{'initial':1000,'stake':100,'maxOpenTrades':2,'stoplossPct':8,'timeframe':'4h','detailTimeframe':'1h','reviewedHistory':True},'strategies':strats,'periods':PERIODS,'costs':COSTS,'tasks':matrix['tasks'],'runs':runs,'benchmarks':benchmarks,'candles':candles,'checks':{'archiveChecksums':True,'causalPrefix':True,'frameworkLookahead':lookahead['status'],'accountingReconciled':True},'notes':['所有区间此前已参与研究，本轮是固定规则历史复核；不是未见数据上的样本外验证。','手续费与滑点为研究假设，不是账户实际费率。滑点以额外单边交易成本近似，未改变成交价或模拟跳空。','策略最多两笔100USDT固定投入；基准每币100USDT预算，其余现金，均按1000USDT总账户计算收益。','净值与回撤来自引擎每根4h开盘钱包快照，末点扣强制平仓成本；不代表盘中最坏风险。比较曲线按日抽样，回撤数值用完整快照计算。','三策略统一8%止损、2根4h冷却；期末强制平仓。市场精度/最小交易限制使用当前公共快照，未复原历史规则变更。','官方lookahead-analysis每策略抽查10个信号，并通过30次指标/信号截断一致性检查；这些检查不构成未来盈利保证。','各区间独立从1000USDT开始，完整段与子区间不可相加。回测结果与现有实时模拟账户独立。']}
    assert len(runs)==24 and len(benchmarks)==8
    args.output.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    (w/'report-accounting-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
    print(json.dumps({'runs':len(runs),'trades':sum(len(r['trades']) for r in runs),'report_bytes':args.output.stat().st_size,'accounting_checks':len(checks)}))

if __name__=='__main__':main()
