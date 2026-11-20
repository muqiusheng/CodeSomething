import hashlib
import json
import sqlite3
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backup = root / 'runtime/backups/R2.5/before-v9.db'
current = sqlite3.connect(root / 'runtime/data/codesomething.db')
before = sqlite3.connect(backup)
tables = [row[0] for row in before.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'flyway_schema_history'")]
preserved = {}
for table in tables:
    # Identifiers originate only from our own backup schema, never an HTTP input.
    quoted = '"' + table.replace('"', '""') + '"'
    old = before.execute('SELECT * FROM ' + quoted + ' ORDER BY rowid').fetchall()
    new = current.execute('SELECT * FROM ' + quoted + ' ORDER BY rowid').fetchall()
    preserved[table] = {'rows': len(new), 'unchanged': old == new}
assert all(value['unchanged'] for value in preserved.values()), preserved
tutor_count = current.execute('SELECT count(*) FROM tutor_requests').fetchone()[0]
completion_count = current.execute('SELECT count(*) FROM stage_completions').fetchone()[0]
assert tutor_count == completion_count == 0
with urllib.request.urlopen('http://127.0.0.1:5188/api/v1/health') as response:
    health = json.load(response)
assert health['status'] == 'UP' and health['tutor']['status'] == 'ready'
result = {
    'date': '2026-11-11',
    'frontend': 'http://127.0.0.1:5178', 'backend': 'http://127.0.0.1:5188',
    'backup': 'runtime/backups/R2.5/before-v9.db',
    'backupSha256': hashlib.sha256(backup.read_bytes()).hexdigest(),
    'existingTables': preserved,
    'dailyTutorRequests': tutor_count, 'dailyCompletions': completion_count,
    'schemaVersion': current.execute('SELECT version FROM flyway_schema_history WHERE success=1 ORDER BY installed_rank DESC LIMIT 1').fetchone()[0],
    'health': health,
}
(root / 'docs/acceptance/R2.5/daily-start.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'preservedTables': len(preserved), 'dailyTutorRequests': tutor_count, 'dailyCompletions': completion_count, 'schemaVersion': result['schemaVersion'], 'health': health['status']}, ensure_ascii=False))
