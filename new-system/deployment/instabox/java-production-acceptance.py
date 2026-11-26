#!/usr/bin/env python3
"""Make one Java submission using the existing dedicated production test learner."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

DOCKER = ["docker", "-H", "unix:///run/user/1001/docker.sock", "exec", "-i", "codesomething-instabox-backend-1"]
TEST_ACCOUNT = Path("/data/codesomething/backups/mysql-0.8.1-candidate-20261126/qa-learner.json")


def request(route, data=None, learner=None, workspace=None):
    headers = {"Content-Type": "application/json"}
    if learner:
        headers["Authorization"] = "Bearer " + learner
    if workspace:
        headers["X-CS-Workspace-Authorization"] = "Bearer " + workspace
    lines = [
        "silent", "show-error", "max-time = 12",
        "write-out = " + json.dumps("\n%{http_code}"),
        "url = " + json.dumps("http://127.0.0.1:5188" + (route if route.startswith("/api/") else "/api/v1" + route)),
    ]
    lines.extend("header = " + json.dumps(f"{name}: {value}") for name, value in headers.items())
    if data is not None:
        lines.append("data-binary = " + json.dumps(json.dumps(data)))
    result = subprocess.run(DOCKER + ["curl", "--config", "-"], input="\n".join(lines) + "\n",
                            text=True, check=True, capture_output=True, timeout=15)
    body, code = result.stdout.rsplit("\n", 1)
    if code not in {"200", "201"}:
        raise RuntimeError(f"{route}: HTTP {code}")
    return json.loads(body)


def main(state, submit_only=False):
    os.umask(0o077)
    credentials = json.loads(TEST_ACCOUNT.read_text())
    session = request("/auth/login", {field: credentials[field] for field in ("username", "password")})
    assert session["role"] == "ROLE_STUDENT"
    bearer = session["token"]
    if state.exists():
        saved = json.loads(state.read_text())
    else:
        workspace = request("/browser-workspaces", {
            "courseId": "http-json-basics", "courseVersion": "1.1.0", "stageId": "workspace",
            "clientKey": "remote-java-production-" + secrets.token_hex(10),
        }, bearer)
        binding = workspace["id"]
        key = workspace["token"]
        code = 'class TaskServer { public static void main(String[] args) { System.out.println("Production remote Java"); } }'
        draft = request(f"/browser-workspaces/{binding}/draft", {
            "expectedRevision": workspace["revision"], "files": {"TaskServer.java": code},
        }, bearer, key)
        submission = request("/submissions", {"bindingId": binding, "expectedDigest": draft["digest"]}, bearer, key)
        saved = {"key": key, "submission": submission["id"]}
        job = request("/check-jobs", {"submissionId": saved["submission"], "idempotencyKey": "production-first"}, bearer, key)
        saved["job"] = job["id"]
        with state.open("x") as out:
            json.dump(saved, out)
        assert job["status"] == "queued" and "判题节点" in job["message"], job["status"]
    if submit_only:
        print("Production test learner: one Java submission is queued on the main site")
        return
    key = saved["key"]
    job_id = saved["job"]
    for attempt in range(27):
        job = request(f"/jobs/{job_id}", learner=bearer, workspace=key)
        if job["status"] not in ("queued", "running"):
            break
        time.sleep(2)
    assert job["status"] == "passed", job["status"]
    assert any(a["passed"] and a["actual"] == "Production remote Java" for a in job["report"]["assertions"])
    repeated = request("/check-jobs", {
        "submissionId": saved["submission"], "idempotencyKey": "production-repeated",
    }, bearer, key)
    history = request(f"/submissions/{saved['submission']}/jobs", learner=bearer, workspace=key)
    assert repeated["id"] == job_id and len(history) == 1, "A submission must keep only one recorded result"
    request("/auth/logout", {}, bearer)
    print("Production test learner: one actual remote Java execution and exactly one passing result")


if __name__ == "__main__":
    main(Path(sys.argv[1]), len(sys.argv) > 2 and sys.argv[2] == "submit-only")
