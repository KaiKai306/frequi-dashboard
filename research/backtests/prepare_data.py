"""Verify all original monthly ZIP checksums; emit Freqtrade OHLCV Feather files."""
from pathlib import Path
import argparse,csv,datetime as dt,hashlib,io,json,zipfile
import pandas as pd


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--sources',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
    a.output.mkdir(parents=True,exist_ok=True);audit={}
    for symbol in ['BTCUSDT','ETHUSDT']:
        rows=[];files={}
        for year in range(2021,2027):
            for month in range(1,13):
                if (year,month)<(2021,11) or (year,month)>(2026,9):continue
                n=f'history_{symbol}_{year}_{month:02d}';raw=(a.sources/(n+'.raw')).read_bytes()
                expected=(a.sources/(n+'_sha256.raw')).read_text().split()[0]
                actual=hashlib.sha256(raw).hexdigest();assert expected==actual,n;files[n]=actual
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    assert len(z.namelist())==1
                    for row in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())):
                        stamp=int(row[0]);stamp=stamp//1000 if stamp>100_000_000_000_000 else stamp
                        rows.append([stamp,*map(float,row[1:6])])
        df=pd.DataFrame(rows,columns=['date','open','high','low','close','volume'])
        assert df['date'].is_monotonic_increasing and not df['date'].duplicated().any()
        assert ((df['high']>=df[['open','close']].max(axis=1)) & (df['low']<=df[['open','close']].min(axis=1)) & (df['volume']>=0)).all()
        gaps=df.loc[df['date'].diff()!=3600000,'date'].iloc[1:].tolist();assert gaps==[1679666400000]
        df['date']=pd.to_datetime(df['date'],unit='ms',utc=True)
        four=df.set_index('date').resample('4h').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'})
        counts=df.set_index('date')['close'].resample('4h').count();four=four.loc[counts==4].reset_index()
        assert len(df)==43079 and len(four)==10769
        for tf,data in [('1h',df),('4h',four)]:data.reset_index(drop=True).to_feather(a.output/f'{symbol[:-4]}_USDT-{tf}.feather')
        audit[symbol]={'archives':files,'hourly_rows':len(df),'four_hour_complete_rows':len(four),'known_missing_hour':'2023-03-24T13:00:00Z','excluded_four_hour_window':'2023-03-24T12:00:00Z','first':str(df['date'].iloc[0]),'last':str(df['date'].iloc[-1])}
    (a.output/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps({'verified_archives':118,'rows_per_symbol':43079,'complete_4h_per_symbol':10769}))

if __name__=='__main__':main()
