"""Claim unstarted jobs and import verified results without duplicating the matrix."""
from pathlib import Path
import datetime,fcntl,hashlib,io,json,os,shlex,signal,stat,subprocess,tarfile,time,zipfile

work=Path(__file__).resolve().parent
setup=json.loads((work/'distributed-setup.json').read_text());remote=setup['remote_work']
lock=(work/'distributed.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
families=['Sma','HorizonSma','Donchian','RsiBbands','AdxMomentum','Supertrend','EmaPullback']
periods={'2022-2023':('20220101','20240101'),'2024-2025':('20240101','20260101'),'2026-q1-q3':('20260101','20261001')}
jobs={f'15m-s{s}-{p}-{c}':(s,p,c) for s in [250,450] for p in periods for c in ['base','stress']}
anchors={};completed=[];child=None;installed={}

def ssh(code):
    return subprocess.check_output(['ssh','-n','-o','StrictHostKeyChecking=yes','happykai-main','python3 -c '+shlex.quote(code)])

def release(ident,row):
    blocked=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
    try:
        dest=work/'results'/ident;body=(json.dumps(row,indent=2)+'\n').encode()
        temp=dest/'task.import.json';temp.write_bytes(body);temp.replace(dest/'task.json')
        fd=anchors.pop(ident);os.write(fd,body);os.close(fd)
    finally:signal.pthread_sigmask(signal.SIG_SETMASK,blocked)

def failed(ident,reason):
    s,p,c=jobs[ident]
    # Preserve any partial transfer outside the result directory before local retry.
    for path in installed.get(ident,[]):
        if path.exists():
            retained=work/'handoff-incomplete'/ident/path.name;retained.parent.mkdir(parents=True,exist_ok=True)
            assert not retained.exists();path.replace(retained)
    release(ident,{'id':ident,'timeframe':'15m','stake':s,'period':p,'cost':c,'state':'failed','handoff_error':reason,'strategy_count':7})

def interrupted(signum,frame):raise RuntimeError('Coordinator interrupted '+str(signum))
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)

try:
    # Claim sufficiently ahead of the original runner. No engine.log may exist.
    for ident in jobs:
        dest=work/'results'/ident;dest.mkdir(exist_ok=True);dest.chmod(0o2770)
        assert not (dest/'engine.log').exists() and not (dest/'task.json').exists(),ident
        os.mkfifo(dest/'task.json',0o640);anchors[ident]=os.open(dest/'task.json',os.O_RDWR|os.O_NONBLOCK)
    (work/'distributed-claims.json').write_text(json.dumps({'remote_work':remote,'claimed':list(anchors),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
    # Preflight the pinned image before starting the isolated, no-network jobs.
    image='freqtradeorg/freqtrade:2026.10@sha256:0cc4b6dc9b16e0516d27efae1765e925da7d6aea5c8f3c3825930ffe3098d7c7'
    remote_start='import pathlib,subprocess,time;w=pathlib.Path('+repr(remote)+');image='+repr(image)+';deadline=time.monotonic()+600\nwhile subprocess.run(["docker","image","inspect",image],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:\n assert time.monotonic()<deadline,"Image pull timeout";time.sleep(5)\nwith (w/"matrix-driver.log").open("w") as log: subprocess.run(["python3","remote_matrix.py"],cwd=w,stdout=log,stderr=subprocess.STDOUT,check=True)'
    command='python3 -c '+shlex.quote(remote_start)
    child=subprocess.Popen(['ssh','-n','-o','StrictHostKeyChecking=yes','happykai-main',command])
    while anchors:
        code='from pathlib import Path;import json;w=Path('+repr(remote)+')/"work/results";print(json.dumps({p.parent.name:json.loads(p.read_text()) for p in w.glob("*/task.json")}))'
        status=json.loads(ssh(code))
        for ident in list(anchors):
            row=status.get(ident)
            if row is None:continue
            assert row['state']=='completed',row
            base=remote+'/work/results/'+ident
            bundle=ssh('from pathlib import Path;import tarfile,io,sys;w=Path('+repr(base)+');b=io.BytesIO();a=tarfile.open(fileobj=b,mode="w:gz");[a.add(p,arcname=p.name) for p in sorted(w.iterdir()) if p.is_file()];a.close();sys.stdout.buffer.write(b.getvalue())')
            expected=json.loads(ssh('from pathlib import Path;import json,hashlib;w=Path('+repr(base)+');print(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in w.iterdir() if p.is_file()}))'))
            files={}
            with tarfile.open(fileobj=io.BytesIO(bundle),mode='r:gz') as archive:
                for item in archive.getmembers():
                    assert item.isfile() and Path(item.name).name==item.name and item.name in expected
                    body=archive.extractfile(item).read();assert hashlib.sha256(body).hexdigest()==expected[item.name];files[item.name]=body
            assert set(files)==set(expected) and 'engine.log' in files and 'task.json' in files
            row=json.loads(files['task.json']);s,p,c=jobs[ident]
            assert all(row[k]==v for k,v in {'id':ident,'timeframe':'15m','stake':s,'period':p,'cost':c,'state':'completed','strategy_count':7}.items())
            zips=[n for n in files if n.endswith('.zip')];assert len(zips)==1
            with zipfile.ZipFile(io.BytesIO(files[zips[0]])) as z:
                assert z.testzip() is None
                names=z.namelist();conf=json.loads(z.read(next(n for n in names if n.endswith('_config.json'))))
                assert conf['dry_run'] and conf['trading_mode']=='spot' and conf['stake_amount']==s and conf['dry_run_wallet']==1000
                assert not conf['exchange'].get('key') and not conf['exchange'].get('secret')
                data=json.loads(z.read(next(n for n in names if n.endswith('.json') and not n.endswith('_config.json'))))
                assert set(data['strategy'])=={f+'Study15m' for f in families}
                for v in data['strategy'].values():
                    assert v['timeframe']=='15m' and v['timeframe_detail']=='5m' and v['starting_balance']==1000
                    assert v['stake_amount']==s and v['timerange']=='-'.join(periods[p]) and v['stoploss']==-.08 and v['max_open_trades_setting']==2
                    for t in v['trades']:assert t['fee_open']==t['fee_close']==(.0012 if c=='base' else .0025)
            dest=work/'results'/ident
            for name,body in files.items():
                if name=='task.json':continue
                target=dest/name;assert not target.exists();installed.setdefault(ident,[]).append(target);target.write_bytes(body);target.chmod(0o640)
            row['execution_host']='happykai-main';row['execution_hostname']='LAX-VPS-k0228uxg'
            transfer=dest/'transfer-checks.json';installed.setdefault(ident,[]).append(transfer)
            transfer.write_text(json.dumps({'files':expected,'zip_verified':True,'rules_config_fees_verified':True},indent=2)+'\n')
            release(ident,row);completed.append(ident)
            print(json.dumps({'imported':ident,'completed_remote_groups':len(completed)}),flush=True)
        if not anchors:break
        if child.poll() is not None:raise RuntimeError('Remote driver ended early: '+str(child.returncode))
        time.sleep(15)
    assert child.wait(timeout=60)==0
    evidence=json.loads(ssh('from pathlib import Path;import json,subprocess;w=Path('+repr(remote)+');before=json.loads((w/"production-before.json").read_text());now={};\nfor name,old in before.items():\n c=json.loads(subprocess.check_output(["docker","inspect",name]))[0];now[name]={"id":c["Id"],"started":c["State"]["StartedAt"],"restart_count":c["RestartCount"]}\nassert before==now;print(json.dumps({"production_unchanged":True,"production_containers":len(now),"matrix":json.loads((w/"work/remote-matrix.json").read_text())}))'))
    evidence.update({'remote_work':remote,'imported':completed,'manifest':setup['manifest']})
    (work/'distributed-result.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps({'distributed_complete':True,'groups':len(completed),'production_unchanged':True}),flush=True)
finally:
    for ident in list(anchors):failed(ident,'Remote handoff did not complete; resume locally')
    if child is not None and child.poll() is None:child.terminate()
