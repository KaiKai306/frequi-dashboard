"""Download independently checked terminal bars without extending the trade window."""
from pathlib import Path
import hashlib,json,shutil,urllib.request,datetime,os
w=Path(__file__).resolve().parent;b=w/'boundary';b.mkdir(mode=0o2770,exist_ok=False);b.chmod(0o2770);(b/'input').mkdir(mode=0o2770)
os.umask(0o027);rows=[]
for symbol in ['BTCUSDT','ETHUSDT']:
 for tf in ['5m','15m','1h']:
  name=f'{symbol}-{tf}-2026-10-01.zip';url=f'https://data.binance.vision/data/spot/daily/klines/{symbol}/{tf}/{name}'
  bodies={}
  for suffix,limit in [('.CHECKSUM',4096),('',2_000_000)]:
   request=urllib.request.Request(url+suffix,headers={'User-Agent':'QuantStrategyResearch/1.0'})
   with urllib.request.urlopen(request,timeout=30) as response:body=response.read(limit+1);assert len(body)<=limit
   (b/'input'/(name+suffix)).write_bytes(body);bodies[suffix]=body
  digest=hashlib.sha256(bodies['']).hexdigest();assert digest==bodies['.CHECKSUM'].decode().split()[0]
  rows.append({'symbol':symbol,'timeframe':tf,'name':name,'url':url,'sha256':digest})
(b/'terminal-download.json').write_text(json.dumps({'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archives':rows,'trade_end_unchanged':'2026-10-01T00:00:00Z','reason':'Ensure end boundary exists for native engine force liquidation; no signals/entries after cutoff'},indent=2)+'\n')
for name in ['config-s100.json','config-s250.json','config-s450.json','markets.json','frozen.json']:shutil.copy2(w/name,b/name)
(b/'user_data').mkdir(mode=0o2770);(b/'data').mkdir(mode=0o2770)
for path in b.rglob('*'):
 if path.is_dir():path.chmod(0o2770)
 else:path.chmod(0o640)
print(json.dumps({'official_daily_archives_verified':len(rows),'folder':str(b)}))
