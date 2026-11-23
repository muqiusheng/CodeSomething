#!/usr/bin/env python3
"""Exercise SQLite snapshot import into isolated PostgreSQL schemas."""
import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from threading import Barrier

OWNER = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
INDEX_TRIGGER = re.compile(
    r"CREATE TRIGGER (?P<name>admin_index_\w+) AFTER (?P<event>INSERT|UPDATE|DELETE)"
    r" ON (?P<table>\w+)(?: WHEN (?P<condition>[^\n]+))?\s+BEGIN\s+"
    r"INSERT OR IGNORE INTO admin_index_changes VALUES "
    r"\('(?P<kind>\w+)', (?P<id>(?:NEW|OLD)\.id|'')\);\s+END;?",
)
INDEX_PREDICATE = re.compile(r"OLD\.(\w+) IS NOT NEW\.\1")


def ident(name):
    return '"' + name.replace('"', '""') + '"'


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return f"decode('{value.hex()}', 'hex')"
    if isinstance(value, (int, float)):
        return str(value)
    if "\0" in value:
        raise ValueError("A SQLite text value contains a PostgreSQL-incompatible NUL")
    return "'" + value.replace("'", "''") + "'"


def postgres_ddl(ddl):
    ddl = re.sub(r"\bCOLLATE\s+NOCASE\b", 'COLLATE "maqibu_nocase"', ddl, flags=re.I)
    ddl = re.sub(r"\bBLOB\b", "BYTEA", ddl, flags=re.I)
    ddl = re.sub(r"\bjson_array_length\(([a-z_][a-z_0-9]*)\)", r"json_array_length(\1::json)", ddl, flags=re.I)
    # SQLite allows forward references during CREATE TABLE. Copy the schema
    # as declared after ordering dependent tables in the source catalog.
    return ddl


def verify_tables(catalog):
    pending = dict(catalog)
    ordered = []
    while pending:
        ready = [
            name for name, ddl in pending.items()
            if not (set(re.findall(r'\bREFERENCES\s+"?([a-z_][a-z_0-9]*)"?', ddl, re.I))
                    - {name}) & pending.keys()
        ]
        if not ready:
            raise ValueError("Foreign-key dependency cycle in snapshot schema")
        for name in ready:
            ordered.append((name, pending.pop(name)))
    return ordered


def postgres_index_triggers(schema, triggers):
    if not triggers:
        return []
    function = f'{ident(schema)}."record_admin_index_change"'
    journal = f'{ident(schema)}."admin_index_changes"'
    statements = [f"""
        CREATE FUNCTION {function}() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            entity text;
        BEGIN
            IF TG_ARGV[0] = 'completion' THEN
                entity := '';
            ELSIF TG_OP = 'DELETE' THEN
                entity := OLD.id;
            ELSE
                entity := NEW.id;
            END IF;
            INSERT INTO {journal} (kind, entity_id) VALUES (TG_ARGV[0], entity)
            ON CONFLICT (kind, entity_id) DO NOTHING;
            RETURN NULL;
        END;
        $$;
    """]
    for name, ddl in triggers:
        match = INDEX_TRIGGER.fullmatch(ddl.replace("\r\n", "\n"))
        if not match or match["name"] != name:
            raise ValueError(f"Unmapped SQLite trigger: {name}")
        event, kind = match["event"], match["kind"]
        expected_id = "''" if kind == "completion" else "OLD.id" if event == "DELETE" else "NEW.id"
        if match["id"] != expected_id:
            raise ValueError(f"Unexpected entity reference in SQLite trigger: {name}")
        when = ""
        if match["condition"]:
            conditions = match["condition"].split(" OR ")
            if event != "UPDATE" or not all(INDEX_PREDICATE.fullmatch(value) for value in conditions):
                raise ValueError(f"Unmapped SQLite trigger predicate: {name}")
            when = " WHEN (" + " OR ".join(value.replace(" IS NOT ", " IS DISTINCT FROM ")
                                            for value in conditions) + ")"
        statements.append(
            f'CREATE TRIGGER {ident(name)} AFTER {event} ON {ident(schema)}.{ident(match["table"])}'
            f" FOR EACH ROW{when} EXECUTE FUNCTION {function}({literal(kind)});"
        )
    return statements


def copy_sql(connection, schema):
    rows = connection.execute(
        """SELECT type, name, sql FROM sqlite_schema
           WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
               AND tbl_name != 'flyway_schema_history'
           ORDER BY rowid"""
    ).fetchall()
    tables = verify_tables((name, ddl) for kind, name, ddl in rows if kind == "table")
    indexes = [ddl for kind, _, ddl in rows if kind == "index"]
    triggers = [(name, ddl) for kind, name, ddl in rows if kind == "trigger"]
    sql = [f"CREATE SCHEMA {ident(schema)};", f"SET LOCAL search_path TO {ident(schema)}, public;",
           'CREATE COLLATION "maqibu_nocase" (provider = icu, locale = '
           "'und-u-ks-level2', deterministic = false);"]
    evidence = {}
    for name, ddl in tables:
        sql.append(postgres_ddl(ddl).rstrip(";") + ";")
        source_rows = connection.execute(f"SELECT * FROM {ident(name)}").fetchall()
        for row in source_rows:
            sql.append(f"INSERT INTO {ident(name)} VALUES ({', '.join(map(literal, row))});")
        expected = sorted(
            json.dumps([value.hex() if isinstance(value, bytes) else value for value in row],
                       ensure_ascii=False, separators=(",", ":"))
            for row in source_rows
        )
        columns = connection.execute(f"PRAGMA table_info({ident(name)})").fetchall()
        values = [
            f"encode({ident(column[1])}, 'hex')" if column[2].upper() == "BLOB" else ident(column[1])
            for column in columns
        ]
        evidence[name] = {
            "expected": expected,
            "query": f"SELECT json_build_array({', '.join(values)}) FROM {ident(schema)}.{ident(name)};",
        }
    sql.extend(postgres_ddl(ddl).rstrip(";") + ";" for ddl in indexes)
    sql.extend(postgres_index_triggers(schema, triggers))
    return sql, evidence, triggers


def execute(container, sql):
    return subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
        input=sql, text=True, encoding="utf-8", capture_output=True, check=False, timeout=90,
    )


def fingerprint(rows):
    return hashlib.sha256("\n".join(rows).encode()).hexdigest()


def query(container, sql):
    result = execute(container, sql)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.splitlines()


def verify_shared_writes(container, learner_schema):
    accounts = 'SET search_path TO "maqibu_accounts";'
    learner = f"SET search_path TO {ident(learner_schema)};"
    query(container, accounts + """
        INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
        VALUES ('ha-owner', 'ha-owner', 'synthetic', 'ROLE_STUDENT', 'active', 'fixture', 'fixture');
        INSERT INTO invitation_codes (code, created_by, max_uses, expires_at)
        VALUES ('ha-invite', 'ha-owner', 1, 2000000000);
        INSERT INTO user_tokens (id, user_id, refresh_token_hash, expires_at)
        VALUES ('ha-session', 'ha-owner', 'synthetic-refresh', 2000000000);
    """)

    def race(label, statement, expected):
        start = Barrier(2)

        def attempt():
            start.wait(timeout=10)
            return query(container, accounts + statement)

        with ThreadPoolExecutor(max_workers=2) as pool:
            workers = [pool.submit(attempt) for _ in range(2)]
            results = [worker.result() for worker in workers]
        if sorted(results) != [[], [expected]]:
            raise RuntimeError(f"{label}: expected exactly one successful writer")
        print(f"{label}: exactly one of two concurrent connections updated the row")

    race("Single-use invitation", """
        UPDATE invitation_codes SET used_count = used_count + 1
        WHERE code = 'ha-invite' AND status = 'active'
            AND expires_at > 1900000000 AND used_count < max_uses
        RETURNING used_count;
    """, "1")
    race("Refresh-token revocation", """
        UPDATE user_tokens SET revoked = 1
        WHERE refresh_token_hash = 'synthetic-refresh'
            AND revoked = 0 AND expires_at > 1900000000
        RETURNING id;
    """, "ha-session")

    # Each query opens a separate client, as the primary and standby would.
    query(container, learner + """
        INSERT INTO workspace_bindings
        VALUES ('ha-binding', 'browser', 'http-json-basics', '1.1.0', 'run-server', 'source', 'fixture');
        INSERT INTO submissions
        VALUES ('ha-submission', 'ha-binding', 'http-json-basics', '1.1.0', 'run-server',
                'source', decode('7461736b00ff', 'hex'), 'fixture');
        INSERT INTO check_jobs (id, submission_id, binding_id, idempotency_key, status, created_at)
        VALUES ('ha-job', 'ha-submission', 'ha-binding', 'ha-request', 'queued', 'fixture');
    """)
    if query(container, learner + """
        SELECT encode(s.source, 'hex') FROM submissions s
        JOIN check_jobs j ON j.submission_id = s.id WHERE j.id = 'ha-job' AND j.status = 'queued';
    """) != ["7461736b00ff"]:
        raise RuntimeError("A new client could not read the committed submission and queue entry")
    if query(container, learner + """
        SELECT kind FROM admin_index_changes WHERE entity_id IN ('ha-submission', 'ha-job') ORDER BY kind;
    """) != ["check", "submission"]:
        raise RuntimeError("New submission and job were not journaled with the source write")
    query(container, learner + "DELETE FROM admin_index_changes WHERE kind = 'check' AND entity_id = 'ha-job';")
    query(container, learner + "UPDATE check_jobs SET status = 'queued' WHERE id = 'ha-job';")
    if query(container, learner + "SELECT kind FROM admin_index_changes WHERE entity_id = 'ha-job';"):
        raise RuntimeError("A no-op job update was unexpectedly journaled")
    query(container, learner + "UPDATE check_jobs SET status = 'running' WHERE id = 'ha-job';")
    if query(container, learner + "SELECT status FROM check_jobs WHERE id = 'ha-job';") != ["running"]:
        raise RuntimeError("A new client could not read the committed job state")
    if query(container, learner + "SELECT kind FROM admin_index_changes WHERE entity_id = 'ha-job';") != ["check"]:
        raise RuntimeError("The job status change was not journaled")
    print("Admin journal probe: insert and changed-status updates recorded; no-op update ignored")
    print("Shared-write probe: committed submission bytes and job status visible from independent clients")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_directory", type=Path, help="A disposable SQLite fixture directory")
    parser.add_argument("container", help="Dedicated local PostgreSQL container containing no other applications")
    parser.add_argument("--probe-shared-writes", action="store_true",
                        help="Add synthetic rows after import and check concurrent writes and cross-client reads")
    parser.add_argument("--summary-only", action="store_true", help="Omit schema identifiers from verification output")
    args = parser.parse_args()
    directory = args.snapshot_directory.resolve()
    databases = [directory / "codesomething.db", *sorted((directory / "learners").glob("*.db"))]
    sql = ["BEGIN;", "SET LOCAL standard_conforming_strings TO on;"]
    evidence = {}
    trigger_counts = {}
    for file in databases:
        if not file.is_file() or file.is_symlink():
            raise ValueError("Expected a regular SQLite snapshot")
        if file.parent == directory:
            schema = "maqibu_accounts"
        elif OWNER.fullmatch(file.stem):
            schema = "maqibu_" + file.stem.replace("-", "_")
        else:
            raise ValueError("Invalid learner database filename")
        with closing(sqlite3.connect(file.as_uri() + "?mode=ro", uri=True)) as connection:
            connection.execute("BEGIN")
            if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("Corrupt SQLite source")
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise ValueError("Invalid foreign keys in SQLite source")
            statements, tables, triggers = copy_sql(connection, schema)
            sql.extend(statements)
            evidence[schema] = tables
            trigger_counts[schema] = len(triggers)
    sql.append("COMMIT;")
    learner_schemas = [schema for schema in evidence if schema != "maqibu_accounts"]
    if args.probe_shared_writes and not learner_schemas:
        parser.error("--probe-shared-writes requires a learner snapshot")
    query(args.container, "\n".join(sql))
    for schema, tables in evidence.items():
        for table, check in tables.items():
            actual = sorted(json.dumps(json.loads(row), ensure_ascii=False, separators=(",", ":"))
                            for row in query(args.container, check["query"]))
            if fingerprint(actual) != fingerprint(check["expected"]):
                raise RuntimeError(f"Imported row content differs for {table}")
        if not args.summary_only:
            print(f"{schema}: {len(tables)} tables byte/value verified; {trigger_counts[schema]} admin journal triggers installed")
    if args.summary_only:
        print(f"Verified {len(evidence)} schemas, {sum(map(len, evidence.values()))} tables, "
              f"{sum(trigger_counts.values())} admin journal triggers")
    if args.probe_shared_writes:
        verify_shared_writes(args.container, learner_schemas[0])


if __name__ == "__main__":
    main()
