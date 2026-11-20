"""Explicit test-only prior-stage fixtures; never run against the everyday database."""
from pathlib import Path
import sqlite3,sys,datetime
database=Path(sys.argv[1]).resolve()
if database.parent.name not in ['r7-api','r7-api-final'] or 'runtime' not in database.parts:
    raise SystemExit('Only isolated runtime/r7-api is supported')
submission,job,binding,digest=sys.argv[2:]
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
with sqlite3.connect(database) as db:
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('INSERT INTO understanding_attempts VALUES(?,?,?,?,?,?,?,?)',('fixture-r7-prerequisite',job,binding,'1','{}',1,'fixture-r7-prerequisite',now))
    for stage in ['a-read','a-create','a-update-delete','a-validation','a-pagination','a-transfer']:
        db.execute('INSERT INTO stage_completions VALUES(?,?,?,?,?,?,?,?,?,?)',('fixture-r7-'+stage,'task-manager','1.0.0',stage,submission,job,'fixture-r7-prerequisite',digest,'1',now))
print('Six clearly named synthetic prerequisite fixtures inserted into isolated test database')
