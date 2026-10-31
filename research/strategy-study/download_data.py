from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import argparse,datetime,hashlib,json,os,urllib.request
os.umask(0o027)
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
w=args.work.resolve();w.mkdir(parents=True,exist_ok=True);folder=w/'input';folder.mkdir(exist_ok=True);w.chmod(0o2770);folder.chmod(0o2770)
jobs=[(s,tf,y,m) for s in ['BTCUSDT','ETHUSDT'] for tf in ['15m','5m'] for y in range(2021,2027) for m in range(1,13) if (2021,11)<=(y,m)<=(2026,9)]
def one(job):
 s,tf,y,m=job;name=f'{s}-{tf}-{y}-{m:02d}.zip';base=f'https://data.binance.vision/data/spot/monthly/klines/{s}/{tf}/{name}'
 row={'name':name,'url':base,'symbol':s,'timeframe':tf,'year':y,'month':m};p=folder/name;c=folder/(name+'.CHECKSUM')
 for dest,url,limit in [(c,base+'.CHECKSUM',4096),(p,base,8_000_000)]:
  if not dest.exists():
   req=urllib.request.Request(url,headers={'User-Agent':'QuantStrategyResearch/1.0'})
   with urllib.request.urlopen(req,timeout=30) as r:body=r.read(limit+1);assert len(body)<=limit
   temporary=dest.with_suffix(dest.suffix+'.pending');temporary.write_bytes(body);temporary.replace(dest)
 actual=hashlib.sha256(p.read_bytes()).hexdigest();assert actual==c.read_text().split()[0],name
 row.update(bytes=p.stat().st_size,sha256=actual);return row
rows=[];errors=[]
with ThreadPoolExecutor(max_workers=4) as pool:
 for future in as_completed({pool.submit(one,j):j for j in jobs}):
  try:row=future.result();rows.append(row)
  except Exception as e:errors.append(type(e).__name__)
  if (len(rows)+len(errors))%12==0:print(json.dumps({'completed':len(rows),'failed':len(errors),'total':len(jobs),'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)
(w/'download-manifest.json').write_text(json.dumps({'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archives':sorted(rows,key=lambda x:x['name']),'errors':errors},indent=2)+'\n');assert not errors,errors
print(json.dumps({'verified_archives':len(rows),'bytes':sum(r['bytes'] for r in rows)}),flush=True)
