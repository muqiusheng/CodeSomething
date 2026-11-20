"""Read-only daily database inventory; optionally take an online backup before a release."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('--verify', action='store_true')
parser.add_argument('--evidence-directory', default='new-system/docs/acceptance/project-audit')
parser.add_argument('--backup-prefix', default='pre-project-audit-')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
database = root / 'new-system/runtime/data/codesomething.db'
evidence = root / args.evidence_directory
evidence.mkdir(parents=True, exist_ok=True)
connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)

def encoded(value):
    return {'bytes': value.hex()} if isinstance(value, bytes) else value

tables = {}
active = {}
for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    safe = '"' + table.replace('"', '""') + '"'
    rows = [[encoded(value) for value in row] for row in connection.execute('SELECT * FROM ' + safe)]
    serialized = sorted(json.dumps(row, ensure_ascii=True, separators=(',', ':'), sort_keys=True) for row in rows)
    tables[table] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(serialized).encode()).hexdigest()}
    columns = {row[1] for row in connection.execute('PRAGMA table_info(' + safe + ')')}
    if 'status' in columns:
        count = connection.execute('SELECT COUNT(*) FROM ' + safe + " WHERE status IN ('queued','running','cancelling','validating','streaming','planning')").fetchone()[0]
        if count:
            active[table] = count

if args.verify:
    before = json.loads((evidence / 'daily-data-before.json').read_text(encoding='utf-8'))
    changed = sorted(name for name in set(before['tables']) | set(tables) if before['tables'].get(name) != tables.get(name))
    (evidence / 'daily-data-after.json').write_text(json.dumps({'tables': tables, 'changedTables': changed}, indent=2), encoding='utf-8')
    print(json.dumps({'tables': len(tables), 'changedTables': changed}))
    if changed:
        raise SystemExit('Daily records changed; inspect the named tables before claiming data continuity.')
else:
    if active:
        raise SystemExit('Daily work is still active: ' + json.dumps(active))
    backup = database.with_name(args.backup_prefix + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.db')
    with sqlite3.connect(backup) as destination:
        connection.backup(destination)
    (evidence / 'daily-data-before.json').write_text(json.dumps({'tables': tables, 'backup': str(backup)}, indent=2), encoding='utf-8')
    print(json.dumps({'tables': len(tables), 'activeJobs': active, 'backup': str(backup)}))
connection.close()
