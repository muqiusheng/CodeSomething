import hashlib
import runpy
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

DEPLOYMENT = Path(__file__).resolve().parents[2] / "deployment"
PEER = DEPLOYMENT / "peer-backup.py"


def run(script, *args, data=None):
    return subprocess.run([sys.executable, script, *args], input=data, capture_output=True)


class PeerBackupTest(unittest.TestCase):
    def test_missing_live_checkpoints_do_not_publish_a_successful_archive(self):
        backup = runpy.run_path(DEPLOYMENT / "backup-sqlite.py")["backup"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            with closing(sqlite3.connect(source / "codesomething.db")) as db, db:
                db.execute("CREATE TABLE saved (node TEXT)")
            destination = root / "outgoing"
            with self.assertRaises((OSError, subprocess.SubprocessError)):
                backup(source, destination, mysql_docker_host="unix:///missing-drill-docker.sock")
            self.assertEqual(list(destination.glob("*.tar.gz")), [])

    def test_archives_completed_mysql_snapshots_but_not_partial_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            snapshots = source / "mysql-idle"
            snapshots.mkdir(parents=True)
            with closing(sqlite3.connect(source / "codesomething.db")) as db, db:
                db.execute("CREATE TABLE saved (node TEXT)")
            name = "cs-sql-school-" + ("a" * 24)
            (snapshots / (name + ".sql")).write_bytes(b"CREATE DATABASE lab;\n")
            (snapshots / (name + ".restoring")).touch()
            (snapshots / "dump-incomplete.partial").write_bytes(b"incomplete")
            backup = run(DEPLOYMENT / "backup-sqlite.py", source, root / "archive",
                         "--include-mysql-snapshots")
            self.assertEqual(backup.returncode, 0, backup.stderr)
            restored = root / "destination"
            verified = run(PEER, "restore-check", backup.stdout.decode().strip(), restored)
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertEqual(list((restored / "mysql-idle").iterdir()),
                             [restored / "mysql-idle" / (name + ".sql")])
            self.assertEqual((restored / "mysql-idle" / (name + ".sql")).read_bytes(),
                             b"CREATE DATABASE lab;\n")

    def test_bad_checksum_and_conflicting_retry_leave_existing_backup_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            inbox = Path(directory)
            name = "codesomething-20261123T100000.000000Z.tar.gz"
            first = b"original backup fixture"
            original = hashlib.sha256(first).hexdigest()
            self.assertNotEqual(run(PEER, "receive", inbox, name, original, data=b"truncated").returncode, 0)
            self.assertEqual(list(inbox.iterdir()), [])
            self.assertEqual(run(PEER, "receive", inbox, name, original, data=first).returncode, 0)
            self.assertEqual(run(PEER, "receive", inbox, name, original, data=first).returncode, 0)
            second = b"different backup fixture"
            replacement = hashlib.sha256(second).hexdigest()
            self.assertNotEqual(run(PEER, "receive", inbox, name, replacement, data=second).returncode, 0)
            self.assertEqual((inbox / name).read_bytes(), first)

    def test_both_nodes_can_receive_and_restore_without_touching_live_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            primary = root / "primary" / "database"
            primary.mkdir(parents=True)
            with closing(sqlite3.connect(primary / "codesomething.db")) as connection, connection:
                connection.execute("CREATE TABLE saved (node TEXT)")
                connection.execute("INSERT INTO saved VALUES ('primary-before-switch')")

            def transfer(source, target, data):
                snapshot = run(DEPLOYMENT / "backup-sqlite.py", data, root / source / "outgoing")
                self.assertEqual(snapshot.returncode, 0, snapshot.stderr)
                archive = Path(snapshot.stdout.decode().strip())
                payload = archive.read_bytes()
                digest = hashlib.sha256(payload).hexdigest()
                inbox = root / target / "incoming" / source
                received = run(PEER, "receive", inbox, archive.name, digest, data=payload)
                self.assertEqual(received.returncode, 0, received.stderr)
                restored = root / target / f"restore-{source}"
                result = run(PEER, "restore-check", inbox / archive.name, restored)
                self.assertEqual(result.returncode, 0, result.stderr)
                return restored

            standby = transfer("primary", "standby", primary)
            with closing(sqlite3.connect(standby / "codesomething.db")) as connection, connection:
                self.assertEqual(connection.execute("SELECT node FROM saved").fetchall(), [("primary-before-switch",)])
                connection.execute("INSERT INTO saved VALUES ('standby-after-switch')")
            returned = transfer("standby", "primary", standby)
            with closing(sqlite3.connect(returned / "codesomething.db")) as connection:
                self.assertEqual(connection.execute("SELECT node FROM saved ORDER BY rowid").fetchall(),
                                 [("primary-before-switch",), ("standby-after-switch",)])
            with closing(sqlite3.connect(primary / "codesomething.db")) as connection:
                self.assertEqual(connection.execute("SELECT node FROM saved").fetchall(), [("primary-before-switch",)])


if __name__ == "__main__":
    unittest.main()
