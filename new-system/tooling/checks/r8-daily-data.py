"""Back up and verify the everyday database across V12 -> V13; never copy test evidence."""
from pathlib import Path
import sqlite3,datetime,hashlib,json,sys
root=Path(__file__).resolve().parents[2]
source=root/'runtime/data/codesomething.db'
out=root/'docs/acceptance/R8'
def digest(db):
    result={}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='flyway_schema_history' ORDER BY name"):
        rows=db.execute('SELECT * FROM "'+name.replace('"','""')+'"').fetchall()
        encoded=sorted(json.dumps([v.hex() if isinstance(v,bytes) else v for v in row],ensure_ascii=False,default=str) for row in rows)
        result[name]=dict(count=len(rows),sha256=hashlib.sha256('\n'.join(encoded).encode()).hexdigest())
    return result
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as db:
    if sys.argv[1]=='backup':
        backup=root/'runtime/backups'/('pre-r8-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.db')
        backup.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(backup) as destination:db.backup(destination)
        report=dict(backup=str(backup),tables=digest(db))
        (out/'daily-before.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Backup created; '+str(len(report['tables']))+' original data tables fingerprinted.')
    else:
        before=json.loads((out/'daily-before.json').read_text(encoding='utf-8'))
        current=digest(db)
        changes=[name for name,value in before['tables'].items() if current.get(name)!=value]
        added={name:value for name,value in current.items() if name not in before['tables']}
        report=dict(schemaVersion=db.execute('SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1').fetchone()[0],changedTables=changes,addedTables=added,tables=current,integrity=db.execute('PRAGMA integrity_check').fetchone()[0],foreignKeyErrors=db.execute('PRAGMA foreign_key_check').fetchall())
        (out/'daily-after.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        assert not changes,changes
        assert set(added)=={'portfolio_works','portfolio_previews','portfolio_checks','portfolio_explanations','portfolio_visits'},added
        assert all(v['count']==0 for v in added.values())
        assert report['schemaVersion']=='13' and report['integrity']=='ok' and not report['foreignKeyErrors']
        print('Original '+str(len(before['tables']))+' data tables unchanged; five new empty tables; V13 integrity and foreign keys normal.')
