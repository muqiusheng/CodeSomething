#!/usr/bin/env python3
"""Exercise the normal course API through an isolated copy of the production backend."""
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def api(path, payload=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if payload is None else json.dumps(payload).encode()
    try:
        with urlopen(Request("http://127.0.0.1:17686" + path, data, headers), timeout=90) as response:
            return json.load(response)
    except HTTPError as error:
        message = json.load(error)
        raise RuntimeError(f"{path}: HTTP {error.code} {message.get('code', '')} {message.get('message', '')}") from None


def run(state, action):
    auth = "/api/v1/auth"
    if state.exists():
        student = api(auth + "/login", json.loads(state.read_text()))
    else:
        username = "remote_sql_qa_" + secrets.token_hex(5)
        credentials = {"username": username, "password": secrets.token_urlsafe(28)}
        student = api(auth + "/register", {**credentials, "email": username + "@example.com"})
        state.write_text(json.dumps(credentials))
    assert student["role"] == "ROLE_STUDENT"
    token = student["token"]
    route = "/api/school/courses/database-systems/labs/lab-03-single-query"
    detail = api(route, token=token)
    if action in ("save", "restore"):
        if action == "save":
            api("/api/school/courses/database-systems/databases", {"name": "migration_probe"}, token)
            statement = (
                "CREATE TABLE migration_marker (id INT PRIMARY KEY, score INT); "
                "INSERT INTO migration_marker VALUES (1, 194);"
            )
        else:
            statement = "SELECT score FROM migration_marker WHERE id=1;"
        execution = api(route + "/run", {
            "revision": detail["work"]["revision"], "questionId": "q04",
            "drafts": {"q04": statement}, "database": "migration_probe",
        }, token)["results"]["q04"]
        assert execution["status"] == "ok", execution.get("message")
        if action == "restore":
            assert any(["194"] in table["rows"] for table in execution["tables"])
        print(f"Dedicated learner MySQL {action} verified")
        return
    answer = "SELECT * FROM course WHERE Cname IN ('高数', 'C语言程序设计');"
    marked = api(route + "/grade", {
        "revision": detail["work"]["revision"], "questionId": "q04", "drafts": {"q04": answer},
    }, token)
    grade = marked["work"]["executions"]["q04"]["grade"]
    if (grade["status"], grade["score"]) != ("correct", 10):
        diagnostic = api(route + "/questions/q04/debug", {"sql": answer, "mode": "run"}, token)
        raise RuntimeError(f"Expected 10/10, received {grade['status']}: {diagnostic.get('error')}")
    print("Dedicated learner scored 10/10 through the production MySQL course API")


if __name__ == "__main__":
    os.umask(0o077)
    run(Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else "grade")
