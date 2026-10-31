from pathlib import Path
import datetime,hashlib,io,json,shlex,subprocess,tarfile
w=Path(__file__).resolve().parent;b=w/'boundary';source=Path('/srv/ccpocket/workspace/项目开发/币安量化交易/frontend/trellis/research/strategy-study');stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');remote='/home/agent/ccpocket-maint/2026-10-31/quant-terminal-correction-'+stamp
entries={'run_boundary.py':(w/'run_boundary.py').read_bytes()}
for name in json.loads((b/'frozen.json').read_text())['sources']:entries['source/'+name]=(source/name).read_bytes()
for name in ['frozen.json','terminal-freeze.json','terminal-download.json','config-s100.json','config-s250.json','config-s450.json','markets.json','data/audit.json']:entries['work/'+name]=(b/name).read_bytes()
for p in (b/'data').glob('*.feather'):entries['work/data/'+p.name]=p.read_bytes()
manifest={name:hashlib.sha256(body).hexdigest() for name,body in entries.items()};buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
 for name,body in entries.items():
  item=tarfile.TarInfo(name);item.size=len(body);archive.addfile(item,io.BytesIO(body))
code='''from pathlib import Path
import hashlib,io,json,os,socket,subprocess,sys,tarfile
assert socket.gethostname()=="LAX-VPS-k0228uxg"
w=Path(REMOTE);assert not w.exists();w.mkdir(parents=True,mode=0o750)
mem={l.split(":")[0]:int(l.split()[1]) for l in Path("/proc/meminfo").read_text().splitlines()};assert mem["MemAvailable"]>5200*1024
ids=subprocess.check_output(["docker","ps","-q"],text=True).split();cs=json.loads(subprocess.check_output(["docker","inspect",*ids]));before={c["Name"]:{"id":c["Id"],"started":c["State"]["StartedAt"],"restart_count":c["RestartCount"]} for c in cs};(w/"production-before.json").write_text(json.dumps(before,indent=2))
expected=EXPECTED
with tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()),mode="r:gz") as archive:
 for member in archive.getmembers():
  assert member.isfile() and member.name in expected and ".." not in Path(member.name).parts
  body=archive.extractfile(member).read();assert hashlib.sha256(body).hexdigest()==expected[member.name];p=w/member.name;p.parent.mkdir(parents=True,exist_ok=True,mode=0o750);p.write_bytes(body);p.chmod(0o640)
for p in (w/"work").rglob("*"):
 if p.is_dir():p.chmod(0o2770)
(w/"work").chmod(0o2770);(w/"work/user_data").mkdir(mode=0o2770);(w/"manifest.json").write_text(json.dumps(expected,indent=2));print(json.dumps({"remote_work":str(w),"files":len(expected),"original_production_containers":len(before)}))
'''.replace('REMOTE',repr(remote)).replace('EXPECTED',repr(manifest))
result=subprocess.run(['ssh','-o','StrictHostKeyChecking=yes','happykai-main','python3 -c '+shlex.quote(code)],input=buffer.getvalue(),capture_output=True);assert result.returncode==0,result.stderr.decode();data=json.loads(result.stdout);data['manifest']=manifest;(w/'boundary-remote-setup.json').write_text(json.dumps(data,indent=2)+'\n');print(result.stdout.decode())
