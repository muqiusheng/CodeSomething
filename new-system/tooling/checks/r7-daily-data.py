"""Back up/compare everyday SQLite data without importing acceptance fixtures."""
from pathlib import Path
import sqlite3,datetime,hashlib,json,sys
root=Path(__file__).resolve().parents[2]
source=root/'runtime/data/codesomething.db'
out=root/'docs/acceptance/R7'
def digest(db):
    result={}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        rows=db.execute('SELECT * FROM "'+name.replace('"','""')+'"').fetchall()
        encoded=sorted(json.dumps([v.hex() if isinstance(v,bytes) else v for v in row],ensure_ascii=False,default=str) for row in rows)
        result[name]=dict(count=len(rows),sha256=hashlib.sha256('\n'.join(encoded).encode()).hexdigest())
    return result
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as db:
    if sys.argv[1]=='backup':
        backup=root/'runtime/backups'/('pre-r7-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.db')
        backup.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(backup) as destination:db.backup(destination)
        report=dict(backup=str(backup),tables=digest(db))
        (out/'daily-before.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Everyday SQLite backup created; '+str(len(report['tables']))+' tables fingerprinted.')
    else:
        before=json.loads((out/'daily-before.json').read_text(encoding='utf-8'))
        current=digest(db)
        changes=[name for name,value in before['tables'].items() if current.get(name)!=value]
        report=dict(schemaVersion=db.execute('SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1').fetchone()[0],changedTables=changes,tables=current,integrity=db.execute('PRAGMA integrity_check').fetchone()[0],foreignKeyErrors=db.execute('PRAGMA foreign_key_check').fetchall(),projectBCompletions=db.execute("SELECT COUNT(*) FROM stage_completions WHERE course_id='collaboration'").fetchone()[0])
        (out/'daily-after.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        assert not changes,changes
        assert report['integrity']=='ok' and not report['foreignKeyErrors']
        assert report['projectBCompletions']==0
        print('All '+str(len(current))+' everyday tables unchanged; integrity/foreign keys normal; no R7 acceptance completions imported.')
