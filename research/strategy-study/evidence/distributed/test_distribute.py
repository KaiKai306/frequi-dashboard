"""Exercise the real coordinator and frozen reader in isolated temporary directories."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,hashlib,importlib.util,io,json,os,runpy,signal,stat,subprocess,tempfile,threading,time,zipfile

parser=argparse.ArgumentParser();parser.add_argument('case',choices=['success','disconnect','corrupt','signal','partial']);case=parser.parse_args().case
here=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('matrix','/srv/ccpocket/workspace/项目开发/币安量化交易/frontend/trellis/research/strategy-study/run_matrix.py');matrix=importlib.util.module_from_spec(spec);spec.loader.exec_module(matrix)
real_sleep=time.sleep;real_open=Path.open;real_write=Path.write_text
with tempfile.TemporaryDirectory(prefix='handoff-test-',dir=here) as directory:
    work=Path(directory);(work/'results').mkdir();(work/'distribute.py').write_bytes((here/'distribute.py').read_bytes());(work/'distributed-setup.json').write_text(json.dumps({'remote_work':'/TEST-ONLY-NO-SSH','manifest':{}}))
    jobs=[('15m',s,p,c) for s in [250,450] for p in matrix.PERIODS for c in matrix.COSTS];fixtures={};rows={}
    for tf,s,p,c in jobs:
        ident=matrix.task_id(tf,s,p,c);row={'id':ident,'timeframe':tf,'stake':s,'period':p['id'],'cost':c['id'],'state':'completed','strategy_count':7,'started_at':'2026-10-31T00:00:00+00:00','duration_seconds':1};rows[ident]=row
        config={'dry_run':True,'trading_mode':'spot','stake_amount':s,'dry_run_wallet':1000,'exchange':{'key':'','secret':''}}
        strategies={f+'Study15m':{'timeframe':'15m','timeframe_detail':'5m','starting_balance':1000,'stake_amount':s,'timerange':p['start'].replace('-','')+'-'+p['end'].replace('-',''),'stoploss':-.08,'max_open_trades_setting':2,'trades':[{'fee_open':c['effective_fee'],'fee_close':c['effective_fee']}]} for f in matrix.FAMILIES}
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w') as z:
            z.writestr('backtest-result_TEST-ONLY.json',json.dumps({'strategy':strategies}));z.writestr('backtest-result_TEST-ONLY_config.json',json.dumps(config))
        fixtures[ident]={'fixture-TEST-ONLY.zip':buffer.getvalue(),'engine.log':b'ISOLATED UNIT TEST FIXTURE; NOT RESEARCH DATA\n','task.json':json.dumps(row).encode()}
    pending=set();fallback=[];outcomes=[];thread_errors=[];first_readers=threading.Event();reader_lock=threading.Lock()
    def observed_open(path,*args,**kwargs):
        if path.name=='task.json' and path.exists() and stat.S_ISFIFO(path.stat().st_mode):
            with reader_lock:
                pending.add(path.parent.name)
                if len(pending)>=3:first_readers.set()
        return real_open(path,*args,**kwargs)
    Path.open=observed_open
    def interrupt_partial(path,*args,**kwargs):
        if case=='partial' and path.name=='transfer-checks.json':signal.raise_signal(signal.SIGTERM)
        return real_write(path,*args,**kwargs)
    Path.write_text=interrupt_partial
    def reader():
        try:
            deadline=time.monotonic()+5
            while not (work/'distributed-claims.json').exists():
                assert time.monotonic()<deadline;real_sleep(.005)
            with ThreadPoolExecutor(max_workers=3) as pool:
                outcomes.extend(pool.map(lambda job:matrix.run_task(work,work,*job),jobs))
        except BaseException as error:thread_errors.append(repr(error))
    readers=threading.Thread(target=reader,daemon=True);readers.start()
    class Child:
        returncode=0
        def poll(self):return None
        def wait(self,timeout):return 0
        def terminate(self):pass
    subprocess.Popen=lambda *a,**kw:Child()
    def fake_engine(command,**kwargs):
        assert command[:3]==['sudo','-n','docker']
        ident=command[command.index('--backtest-directory')+1].split('/')[-1];fallback.append(ident)
        (work/'results'/ident/'fixture-TEST-ONLY.zip').write_bytes(fixtures[ident]['fixture-TEST-ONLY.zip'])
        return type('Completed',(),{'returncode':0})()
    subprocess.run=fake_engine
    def fake_ssh(command):
        assert command[:4]==['ssh','-n','-o','StrictHostKeyChecking=yes']
        assert first_readers.wait(3),'No original matrix readers blocked on FIFOs'
        code=command[-1]
        if 'w.glob("*/task.json")' in code:return json.dumps(rows).encode()
        if 'tarfile,io,sys' in code:
            if case=='disconnect':raise ConnectionError('ISOLATED TEST: dropped SSH')
            if case=='signal':signal.raise_signal(signal.SIGTERM)
            ident=next(ident for ident in fixtures if ident in code)
            import tarfile
            buffer=io.BytesIO()
            with tarfile.open(fileobj=buffer,mode='w:gz') as tar:
                for name,body in fixtures[ident].items():
                    item=tarfile.TarInfo(name);item.size=len(body);tar.addfile(item,io.BytesIO(body))
            return buffer.getvalue()
        if 'hashlib;w=' in code:
            ident=next(ident for ident in fixtures if ident in code);hashes={n:hashlib.sha256(b).hexdigest() for n,b in fixtures[ident].items()}
            if case=='corrupt':hashes['fixture-TEST-ONLY.zip']='0'*64
            return json.dumps(hashes).encode()
        if 'production-before.json' in code:return json.dumps({'production_unchanged':True,'matrix':{'tasks':list(rows.values())}}).encode()
        raise AssertionError(code)
    subprocess.check_output=fake_ssh
    time.sleep=lambda n:real_sleep(.01)
    failed=False
    try:runpy.run_path(str(work/'distribute.py'),run_name='__main__')
    except (ConnectionError,RuntimeError,AssertionError):
        failed=True
        if case=='success':raise
    finally:Path.open=real_open;Path.write_text=real_write;time.sleep=real_sleep
    readers.join(5);assert not readers.is_alive(),'Original scheduler deadlocked'
    assert not thread_errors,thread_errors
    assert len(outcomes)==12 and all(r['state']=='completed' for r in outcomes)
    assert not any(stat.S_ISFIFO(p.stat().st_mode) for p in (work/'results').glob('*/task.json'))
    assert all(len(list(d.glob('*.zip')))==1 for d in (work/'results').iterdir())
    assert failed==(case!='success')
    assert len(fallback)==(0 if case=='success' else 12),fallback
    if case=='partial':assert len(list((work/'handoff-incomplete').glob('*/*.zip')))==1
    result={'case':case,'real_frozen_run_task_used':True,'initial_blocked_readers':len(pending),'completed_groups':len(outcomes),'fallback_local_groups':len(fallback),'deadlock':False,'remaining_fifos':0,'duplicate_archives':False,'real_ssh_or_docker_executed':False}
    (here/('handoff-test-'+case+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
