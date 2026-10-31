"""Uniform terminal-data correction; unchanged frozen engine/rules/configs."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import argparse,hashlib,json,os,socket,sys
parser=argparse.ArgumentParser();parser.add_argument('--remote',action='store_true');args=parser.parse_args()
if args.remote:
 root=Path(__file__).resolve().parent;source=root/'source';work=root/'work';assert socket.gethostname()=='LAX-VPS-k0228uxg'
else:
 source=Path('/srv/ccpocket/workspace/项目开发/币安量化交易/frontend/trellis/research/strategy-study');work=Path(__file__).resolve().parent/'boundary'
sys.path.insert(0,str(source));import run_matrix as matrix
frozen=json.loads((work/'frozen.json').read_text());inputs=json.loads((work/'terminal-freeze.json').read_text())
for name,digest in frozen['sources'].items():assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest
for name,digest in frozen['configs'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==digest
for name,digest in inputs['data_files'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==digest
if args.remote:
 original=matrix.docker_base
 def base(src,w):
  command=original(src,w);assert command[:3]==['sudo','-n','docker'];command=command[2:];command[command.index('--user')+1]='1000:'+str(os.getgid());return command
 matrix.docker_base=base
os.umask(0o027);timeframes=['15m'] if args.remote else ['4h','1h'];period=matrix.PERIODS[-1]
jobs=[(tf,s,period,c) for tf in timeframes for s in matrix.STAKES for c in matrix.COSTS]
with ThreadPoolExecutor(max_workers=4) as pool:
 rows=[future.result() for future in as_completed([pool.submit(matrix.run_task,source,work,*job) for job in jobs])]
for row in rows:
 row['execution_host']='happykai-main' if args.remote else 'ccpocket-local';row['terminal_boundary_corrected']=True
 (work/'results'/row['id']/'task.json').write_text(json.dumps(row,indent=2)+'\n')
out='remote-corrected.json' if args.remote else 'local-corrected.json';(work/out).write_text(json.dumps({'tasks':rows,'workers':4,'terminal_boundary':'2026-10-01T00:00:00Z'},indent=2)+'\n');print(json.dumps({'corrective_groups_complete':len(rows),'remote':args.remote}),flush=True)
