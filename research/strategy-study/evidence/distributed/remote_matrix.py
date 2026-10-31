"""Additional host driver: identical frozen engine/rules, host-specific group ID."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,socket,subprocess,sys
root=Path(__file__).resolve().parent;src=root/'source';work=root/'work';assert socket.gethostname()=='LAX-VPS-k0228uxg';sys.path.insert(0,str(src));import run_matrix as matrix
frozen=json.loads((work/'frozen.json').read_text())
for name,expected in frozen['sources'].items():assert hashlib.sha256((src/name).read_bytes()).hexdigest()==expected
for name,expected in frozen['configs'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==expected
original_base=matrix.docker_base

def remote_base(source,folder):
    command=original_base(source,folder);assert command[:3]==['sudo','-n','docker'];command=command[2:]
    command[command.index('--user')+1]='1000:'+str(os.getgid())
    return command
matrix.docker_base=remote_base
os.umask(0o027);(work/'user_data').mkdir(exist_ok=True);(work/'user_data').chmod(0o2770)

def task(stake,period,cost):
    row=matrix.run_task(src,work,'15m',stake,period,cost);row['execution_host']='happykai-main';row['execution_hostname']=socket.gethostname();row['group_id']=os.getgid()
    path=work/'results'/row['id']/'task.json';path.write_text(json.dumps(row,indent=2)+'\n');print(json.dumps({'remote_completed':row['id']}),flush=True);return row
jobs=[(stake,p,c) for stake in [250,450] for p in matrix.PERIODS for c in matrix.COSTS]
with ThreadPoolExecutor(max_workers=4) as pool:
    futures=[pool.submit(task,*job) for job in jobs];results=[future.result() for future in as_completed(futures)]
(work/'remote-matrix.json').write_text(json.dumps({'tasks':results,'workers':4,'hostname':socket.gethostname()},indent=2)+'\n')
print(json.dumps({'remote_matrix_complete':True,'groups':len(results)}),flush=True)
