from pathlib import Path
import hashlib,io,json,shlex,subprocess,tarfile
w=Path(__file__).resolve().parent;b=w/'boundary';remote=json.loads((w/'boundary-remote-setup.json').read_text())['remote_work']
def ssh(code):return subprocess.check_output(['ssh','-n','-o','StrictHostKeyChecking=yes','happykai-main','python3 -c '+shlex.quote(code)])
data=json.loads(ssh('from pathlib import Path;import json;w=Path('+repr(remote)+');print((w/"work/remote-corrected.json").read_text())'))
assert len(data['tasks'])==6 and all(row['state']=='completed' and row['timeframe']=='15m' for row in data['tasks'])
code='from pathlib import Path;import hashlib,json;w=Path('+repr(remote)+')/"work/results";print(json.dumps({str(p.relative_to(w)):hashlib.sha256(p.read_bytes()).hexdigest() for p in w.rglob("*") if p.is_file()}))';expected=json.loads(ssh(code))
code='from pathlib import Path;import io,sys,tarfile;w=Path('+repr(remote)+')/"work/results";b=io.BytesIO();a=tarfile.open(fileobj=b,mode="w:gz");[a.add(p,arcname=str(p.relative_to(w))) for p in sorted(w.rglob("*")) if p.is_file()];a.close();sys.stdout.buffer.write(b.getvalue())';blob=ssh(code);installed=set()
with tarfile.open(fileobj=io.BytesIO(blob),mode='r:gz') as archive:
 for item in archive.getmembers():
  assert item.isfile() and item.name in expected and not Path(item.name).is_absolute() and '..' not in Path(item.name).parts
  body=archive.extractfile(item).read();assert hashlib.sha256(body).hexdigest()==expected[item.name];p=b/'results'/item.name;assert not p.exists();p.parent.mkdir(parents=True,exist_ok=True,mode=0o2770);p.parent.chmod(0o2770);p.write_bytes(body);p.chmod(0o640);installed.add(item.name)
assert installed==set(expected)
proof=json.loads(ssh('from pathlib import Path;import subprocess,json;w=Path('+repr(remote)+');before=json.loads((w/"production-before.json").read_text());cs=json.loads(subprocess.check_output(["docker","inspect",*before]));after={c["Name"]:{"id":c["Id"],"started":c["State"]["StartedAt"],"restart_count":c["RestartCount"]} for c in cs};assert before==after and all(c["State"]["Running"] for c in cs);print(json.dumps({"original_production_running_and_unchanged":len(cs)}))'))
(b/'remote-corrected.json').write_text(json.dumps(data,indent=2)+'\n');(b/'remote-transfer.json').write_text(json.dumps({'remote_work':remote,'files':expected,'production':proof},indent=2)+'\n');print(json.dumps({'groups_imported':6,'files_sha_verified':len(expected),'original_production_unchanged':True}))
