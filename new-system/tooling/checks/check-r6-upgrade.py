"""Snapshot data content, back up via SQLite, and verify an additive V12 upgrade."""
import argparse, hashlib, json, sqlite3
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('action',choices=['prepare','verify'])
parser.add_argument('--data',required=True)
parser.add_argument('--record',required=True)
parser.add_argument('--copy')
args=parser.parse_args()
database=Path(args.data).resolve()
record=Path(args.record).resolve()
def snapshot(db):
    tables={}
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'flyway_schema_history' ORDER BY name"):
        rows=db.execute('SELECT * FROM "'+table.replace('"','""')+'" ORDER BY rowid').fetchall()
        tables[table]={'count':len(rows),'sha256':hashlib.sha256(repr(rows).encode()).hexdigest()}
    return tables
with sqlite3.connect(database) as db:
    state={'tables':snapshot(db),'integrity':db.execute('PRAGMA integrity_check').fetchone()[0],'foreignKeys':db.execute('PRAGMA foreign_key_check').fetchall()}
    if args.action=='prepare':
        if record.exists():raise SystemExit('Refusing to overwrite a previous baseline')
        if args.copy:
            copy=Path(args.copy).resolve()
            if copy.exists():raise SystemExit('Refusing to overwrite backup/copy')
            copy.parent.mkdir(parents=True,exist_ok=True)
            with sqlite3.connect(copy) as destination:db.backup(destination)
            state['copy']=str(copy)
        record.parent.mkdir(parents=True,exist_ok=True)
        record.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    else:
        before=json.loads(record.read_text(encoding='utf-8'))
        assert all(state['tables'].get(name)==value for name,value in before['tables'].items()),'Original data content changed'
        expected={'project_drafts','generated_courses','generated_attempts','generated_completions','generated_reference_views'}
        assert set(state['tables'])-set(before['tables'])==expected,'Unexpected schema difference'
        assert all(state['tables'][name]['count']==0 for name in expected),'Acceptance data entered daily/copy database'
        assert state['integrity']=='ok' and not state['foreignKeys'],'Integrity check failed'
        state['originalTablesIdentical']=True
        state['schemaVersion']=db.execute('SELECT version FROM flyway_schema_history WHERE success=1 ORDER BY installed_rank DESC LIMIT 1').fetchone()[0]
        record.with_name(record.stem+'-verified.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'originalTablesIdentical':True,'originalTables':len(before['tables']),'newEmptyTables':len(expected),'integrity':'ok'},ensure_ascii=False))
