"""Online backup and byte-independent row fingerprints for the current single-user DB."""
from pathlib import Path
import sys,sqlite3,json,hashlib,datetime
root=Path(__file__).resolve().parents[2]
source=root/'runtime/data/codesomething.db'
out=root/'docs/acceptance/learning-improvements'
out.mkdir(parents=True,exist_ok=True)
def tables(db):
 result={}
 for name, in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
  rows=db.execute('SELECT * FROM "'+name.replace('"','""')+'"').fetchall()
  values=sorted(json.dumps([v.hex() if isinstance(v,bytes) else v for v in row],ensure_ascii=False,default=str) for row in rows)
  result[name]={'count':len(rows),'sha256':hashlib.sha256('\n'.join(values).encode()).hexdigest()}
 return result
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as db:
 if sys.argv[1]=='backup':
  busy={}
  for name in ['check_jobs','sql_attempts','tutor_requests']:
   busy[name]=db.execute('SELECT count(*) FROM '+name+" WHERE status IN ('queued','running','cancelling')").fetchone()[0]
  assert not any(busy.values()),busy
  destination=root/'runtime/backups'/('pre-improvement-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.db')
  destination.parent.mkdir(parents=True,exist_ok=True)
  with sqlite3.connect(destination) as target:db.backup(target)
  report={'backup':str(destination),'active':busy,'tables':tables(db)}
  (out/'daily-before.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  print('Backed up',len(report['tables']),'tables; no active code, SQL or tutor jobs')
 else:
  old=json.loads((out/'daily-before.json').read_text(encoding='utf-8'))['tables'];current=tables(db)
  changed=[name for name in old.keys()|current.keys() if old.get(name)!=current.get(name)]
  report={'changed':changed,'tables':current,'integrity':db.execute('PRAGMA integrity_check').fetchone()[0],'foreignKeys':db.execute('PRAGMA foreign_key_check').fetchall()}
  (out/'daily-after.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  assert not changed and report['integrity']=='ok' and not report['foreignKeys'],report
  print('Verified',len(current),'tables unchanged; integrity and foreign keys normal')
