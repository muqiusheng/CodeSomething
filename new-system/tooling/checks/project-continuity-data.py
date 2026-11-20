"""Back up everyday data before V15, then compare every original table's contents."""
from pathlib import Path
import datetime
import hashlib
import json
import sqlite3
import sys

root = Path(__file__).resolve().parents[2]
out = root / 'docs/acceptance/coding-first'
out.mkdir(parents=True, exist_ok=True)

def fingerprint(db):
    result = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='flyway_schema_history'"):
        rows = db.execute('SELECT * FROM "' + name.replace('"', '""') + '"').fetchall()
        encoded = sorted(json.dumps(row, ensure_ascii=False, default=str) for row in rows)
        result[name] = {'count': len(rows), 'sha256': hashlib.sha256('\n'.join(encoded).encode()).hexdigest()}
    return result

with sqlite3.connect((root / 'runtime/data/codesomething.db').as_uri() + '?mode=ro', uri=True) as db:
    if sys.argv[1] == 'backup':
        backup = root / 'runtime/backups' / ('pre-project-continuity-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.db')
        with sqlite3.connect(backup) as destination:
            db.backup(destination)
        report = {'backup': str(backup), 'tables': fingerprint(db)}
        (out / 'daily-before.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print('Backed up daily database; original table count:', len(report['tables']))
    else:
        before = json.loads((out / 'daily-before.json').read_text(encoding='utf-8'))
        tables = fingerprint(db)
        changes = [name for name, value in before['tables'].items() if tables.get(name) != value]
        report = {'schemaVersion': db.execute('SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1').fetchone()[0], 'changedTables': changes, 'integrity': db.execute('PRAGMA integrity_check').fetchone()[0], 'foreignKeyErrors': db.execute('PRAGMA foreign_key_check').fetchall()}
        (out / 'daily-after.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        assert not changes, changes
        assert report['schemaVersion'] == '15' and report['integrity'] == 'ok' and not report['foreignKeyErrors'], report
        print('V15 verified; all original data tables unchanged, integrity and foreign keys valid.')
