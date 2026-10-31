from pathlib import Path
import hashlib,json,zipfile
import pandas as pd,numpy as np
w=Path('/work');b=w/'boundary';manifest=json.loads((b/'terminal-download.json').read_text());audit=json.loads((w/'data/audit.json').read_text());audit['original_audit_sha256']=hashlib.sha256((w/'data/audit.json').read_bytes()).hexdigest();audit['terminal_archives']=manifest['archives'];audit['terminal_boundary']='2026-10-01T00:00:00Z';audit['terminal_purpose']='Native force-exit price only; entry window remains strictly before cutoff'
for symbol in ['BTCUSDT','ETHUSDT']:
 loaded={}
 for tf in ['5m','15m','1h']:
  row=next(r for r in manifest['archives'] if r['symbol']==symbol and r['timeframe']==tf);p=b/'input'/row['name'];assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
  with zipfile.ZipFile(p) as z:
   with z.open(z.namelist()[0]) as stream:frame=pd.read_csv(stream,header=None,usecols=range(6),names=['date','open','high','low','close','volume'])
  stamp=frame['date'].astype('int64');stamp=stamp.where(stamp<100_000_000_000_000,stamp//1000);frame['date']=pd.to_datetime(stamp,unit='ms',utc=True);loaded[tf]=frame
 # Reconcile all complete daily OHLC aggregations before accepting the boundary.
 for tf,count in [('5m',12),('15m',4)]:
  source=loaded[tf].set_index('date');hour=source.resample('1h').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'});original=loaded['1h'].set_index('date');assert len(hour)==24 and np.max(np.abs(hour[['open','high','low','close']].to_numpy()-original[['open','high','low','close']].to_numpy()))<1e-6
 loaded['4h']=loaded['1h'].set_index('date').resample('4h').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'}).reset_index()
 for tf in ['5m','15m','1h','4h']:
  name=f'{symbol[:-4]}_USDT-{tf}.feather';original=pd.read_feather(w/'data'/name);terminal=loaded[tf].iloc[:1].astype(original.dtypes.to_dict());assert terminal.iloc[0]['date']==pd.Timestamp('2026-10-01',tz='UTC') and original.iloc[-1]['date']<terminal.iloc[0]['date']
  extended=pd.concat([original,terminal],ignore_index=True);assert extended.iloc[:-1].equals(original.reset_index(drop=True));extended.to_feather(b/'data'/name)
  previous=audit['datasets'].get(name,{});audit['datasets'][name]={**previous,'rows':len(extended),'original_sha256':hashlib.sha256((w/'data'/name).read_bytes()).hexdigest(),'sha256':hashlib.sha256((b/'data'/name).read_bytes()).hexdigest(),'appended_bars':1}
(b/'data/audit.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps({'extended_datasets':8,'all_original_rows_unchanged':True,'terminal_ohlc_reconciled':True}))

# Freeze the complete terminal inputs before any result is generated.
import datetime
frozen=json.loads((b/'frozen.json').read_text())
(b/'terminal-freeze.json').write_text(json.dumps({'frozen_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'data_files':{str(p.relative_to(b)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((b/'data').glob('*')) if p.is_file()},'sources':frozen['sources'],'configs':frozen['configs'],'trade_end_unchanged':'2026-10-01T00:00:00Z'},indent=2)+'\n')
