"""Verify lower-frequency source ZIPs and reconcile overlaps with prior data."""
from pathlib import Path
import argparse,datetime,hashlib,json,zipfile
import pandas as pd
import numpy as np


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,default=Path('/work'));a=parser.parse_args();w=a.work
    manifest=json.loads((w/'download-manifest.json').read_text());assert not manifest['errors'] and len(manifest['archives'])==236
    output=w/'data';output.mkdir(exist_ok=True);audit={'source_archives':236,'datasets':{},'reconciliation':[]}
    loaded={}
    for symbol in ['BTCUSDT','ETHUSDT']:
        for tf,minutes in [('5m',5),('15m',15)]:
            frames=[]
            for row in manifest['archives']:
                if row['symbol']!=symbol or row['timeframe']!=tf:continue
                p=w/'input'/row['name'];assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
                with zipfile.ZipFile(p) as z:
                    assert len(z.namelist())==1
                    with z.open(z.namelist()[0]) as stream:d=pd.read_csv(stream,header=None,usecols=range(6),names=['date','open','high','low','close','volume'])
                stamp=d['date'].astype('int64');stamp=stamp.where(stamp<100_000_000_000_000,stamp//1000)
                d['date']=pd.to_datetime(stamp,unit='ms',utc=True);frames.append(d)
            df=pd.concat(frames,ignore_index=True)
            assert df['date'].is_monotonic_increasing and not df['date'].duplicated().any()
            assert np.isfinite(df[['open','high','low','close','volume']].to_numpy()).all()
            assert ((df['high']>=df[['open','close']].max(axis=1)) & (df['low']<=df[['open','close']].min(axis=1)) & (df['volume']>=0) & (df['low']>0)).all()
            expected=pd.date_range('2021-11-01','2026-10-01',freq=f'{minutes}min',inclusive='left',tz='UTC');missing=expected.difference(df['date'])
            assert len(df)+len(missing)==len(expected)
            name=f'{symbol[:-4]}_USDT-{tf}.feather';df.to_feather(output/name);loaded[(symbol,tf)]=df
            audit['datasets'][name]={'rows':len(df),'missing_bars':[t.isoformat() for t in missing],'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()}
        # Verify common complete hourly OHLC values independently of archive granularity.
        for tf,per_hour in [('15m',4),('5m',12)]:
            d=loaded[(symbol,tf)].set_index('date');hour=d.resample('1h').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'});hour=hour.loc[d['close'].resample('1h').count()==per_hour]
            original=pd.read_feather(output/f'{symbol[:-4]}_USDT-1h.feather').set_index('date')
            common=hour.index.intersection(original.index);delta=np.abs(hour.loc[common,['open','high','low','close']].to_numpy()-original.loc[common,['open','high','low','close']].to_numpy())
            assert np.max(delta)<1e-6,(symbol,tf,np.max(delta))
            audit['reconciliation'].append({'symbol':symbol,'source':tf,'against':'previous_verified_1h','common_complete_hours':len(common),'max_ohlc_difference':float(np.max(delta)),'volume_max_difference':float(np.max(np.abs(hour.loc[common,'volume']-original.loc[common,'volume'])))})
    audit['created_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(output/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps({'verified_archives':236,'datasets':{k:{'rows':v['rows'],'missing_count':len(v['missing_bars'])} for k,v in audit['datasets'].items()},'ohlc_reconciliation':'passed'}),flush=True)


if __name__=='__main__':main()
