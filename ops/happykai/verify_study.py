"""Verify served research bytes and gzip decoding using Japan-local dashboard auth."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import base64,gzip,hashlib,http.client,json,socket,sys,datetime
assert socket.gethostname()=='ser608738340395'
root=Path('/opt/binance-quant');record=Path(sys.argv[1]);state=json.loads((record/'state.json').read_text());manifest=state['release_manifest']['files'];secret=json.loads((root/'private/api-server.json').read_text())['api_server']
authorization='Basic '+base64.b64encode((secret['username']+':'+secret['password']).encode()).decode()
def request(name,auth=True,method='GET'):
 connection=http.client.HTTPSConnection('quant.happykai.cn',timeout=30)
 try:
  connection.request(method,'/preview/'+name,headers={'Authorization':authorization} if auth else {})
  response=connection.getresponse();body=response.read(12_000_001);assert len(body)<=12_000_000
  return response.status,body,{k.lower():v for k,v in response.getheaders()}
 finally:connection.close()
def check(item):
 name,expected=item;code,body,headers=request(name)
 assert code==200 and hashlib.sha256(body).hexdigest()==expected,name
 if name.startswith('backtests/'):
  assert headers.get('cache-control')=='no-store',name
 if name.endswith('.gz'):json.loads(gzip.decompress(body))
 return name
with ThreadPoolExecutor(max_workers=3) as pool:checked=list(pool.map(check,manifest.items()))
research=[name for name in manifest if name.startswith('backtests/study/')];assert len(research)>400
samples=['backtests/study/index.json',next(name for name in research if '/reports/' in name),next(name for name in research if '/trades/' in name),next(name for name in research if '/candles/' in name),'backtests/paper-bots.json']
for name in samples:
 assert request(name,False)[0]==401
 assert request(name,True,'POST')[0]==405
code,body,_=request('backtests/study/index.json');index=json.loads(body);assert index['totalRuns']==378 and len(index['reports'])==9
code,body,_=request(index['summaryPath'].removeprefix('/preview/'));summary=json.loads(gzip.decompress(body));assert len(summary['runs'])==378
for desc in index['reports']:
 code,body,_=request(desc['path'].removeprefix('/preview/'));report=json.loads(gzip.decompress(body));assert len(report['runs'])==42 and len(report['strategies'])==7
 for run in report['runs']:assert abs(run['series'][-1][1]-run['metrics']['final'])<1e-5
code,body,_=request('backtests/report.json');assert code==200 and hashlib.sha256(body).hexdigest()==state['before']['original_report_sha256']
result={'tested_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'served_release_files_sha256_verified':len(checked),'research_files_verified':len(research),'all_gzip_json_decodes':True,'original_report_bytes_preserved':True,'all_378_results_and_9_reports_available':True,'auth_and_write_denial_verified':True,'credentials_exported':False}
(record/'reports-live.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
