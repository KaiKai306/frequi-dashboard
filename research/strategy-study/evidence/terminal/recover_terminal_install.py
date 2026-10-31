"""Install all corrected periods together; retain every original input/result."""
from pathlib import Path
import datetime,hashlib,json,shutil,zipfile
w=Path(__file__).resolve().parent;b=w/'boundary';local=json.loads((b/'local-corrected.json').read_text());remote=json.loads((b/'remote-corrected.json').read_text());rows=local['tasks']+remote['tasks'];assert len(rows)==18 and len({r['id'] for r in rows})==18
assert json.loads((b/'causal-check.json').read_text())['passed'];cutoff=1790812800000
assert datetime.datetime.fromtimestamp(cutoff/1000,datetime.timezone.utc).isoformat()=='2026-10-01T00:00:00+00:00'
checks=[]
for row in rows:
 assert row['state']=='completed' and row['period']=='2026-q1-q3'
 paths=list((b/'results'/row['id']).glob('*.zip'));assert len(paths)==1
 with zipfile.ZipFile(paths[0]) as z:
  data=json.loads(z.read(next(n for n in z.namelist() if n.endswith('.json') and not n.endswith('_config.json'))))
 assert len(data['strategy'])==7
 for name,result in data['strategy'].items():
  assert result['backtest_end_ts']==cutoff and result['starting_balance']==1000 and result['timeframe_detail']=='5m'
  for trade in result['trades']:
   assert trade['open_timestamp']<=trade['close_timestamp']<=cutoff and trade['open_timestamp']<cutoff
   assert trade['trade_duration']>=0
  checks.append({'id':row['id']+'-'+name,'chronology_valid':True,'no_entries_on_or_after_cutoff':True,'native_end_at_cutoff':True,'archive_sha256':hashlib.sha256(paths[0].read_bytes()).hexdigest()})
assert len(checks)==126

matrix=json.loads((w/'matrix.json').read_text());backup=Path(matrix['terminal_correction']['original_backup'])
assert backup.is_dir() and len(list((backup/'results').iterdir()))==18
assert {r['id'] for r in matrix['tasks'] if r.get('terminal_boundary_corrected')}=={r['id'] for r in rows}
for row in rows:
 for path in (b/'results'/row['id']).glob('*.zip'):
  assert hashlib.sha256(path.read_bytes()).hexdigest()==hashlib.sha256((w/'results'/row['id']/path.name).read_bytes()).hexdigest()
for path in (b/'data').iterdir():
 assert hashlib.sha256(path.read_bytes()).hexdigest()==hashlib.sha256((w/'data'/path.name).read_bytes()).hexdigest()
pending=w/'.causal-check-terminal-pending';shutil.copy2(b/'causal-check.json',pending);pending.chmod(0o640);pending.replace(w/'causal-check.json')
if (w/'published').exists():
 assert not (backup/'partial-published').exists();(w/'published').replace(backup/'partial-published')
result={'native_trade_checks':checks,'all_126_chronologically_valid':True,'all_18_groups_uniformly_replaced':True,'original_results_and_data_preserved':str(backup),'trade_window_unchanged':True,'original_matrix_runs':378,'additional_corrective_runs':126,'final_comparison_runs':378}
(w/'terminal-correction-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='native_trade_checks'}))
