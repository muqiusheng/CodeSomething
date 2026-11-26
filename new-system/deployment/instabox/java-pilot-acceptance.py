#!/usr/bin/env python3
"""Submit a real console exercise to the isolated pilot, then verify its only result."""
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen


def request(route, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    payload = None if data is None else json.dumps(data).encode()
    with urlopen(Request("http://127.0.0.1:17684/api/v1" + route, payload, headers), timeout=10) as response:
        body = response.read()
        return json.loads(body) if body else None


state = Path(sys.argv[1])
os.umask(0o077)
if sys.argv[2] == "submit":
    workspace = request("/browser-workspaces", {
        "courseId": "http-json-basics", "courseVersion": "1.1.0", "stageId": "workspace",
        "clientKey": "remote-java-dedicated-test-learner-20261126",
    })
    binding, token = workspace["id"], workspace["token"]
    draft = request("/browser-workspaces/" + binding + "/draft", {
        "expectedRevision": workspace["revision"],
        "files": {"TaskServer.java": 'class TaskServer { public static void main(String[] args) { System.out.println("Maqibu Java pilot"); } }'},
    }, token)
    submission = request("/submissions", {"bindingId": binding, "expectedDigest": draft["digest"]}, token)
    job = request("/check-jobs", {"submissionId": submission["id"], "idempotencyKey": "initial"}, token)
    with state.open("x", encoding="utf-8") as output:
        json.dump({"submission": submission["id"], "job": job["id"], "token": token}, output)
    assert job["status"] == "queued", job["status"]
    print("Dedicated test submission queued on main")
else:
    saved = json.loads(state.read_text(encoding="utf-8"))
    retry = request("/check-jobs", {"submissionId": saved["submission"], "idempotencyKey": "retry"}, saved["token"])
    history = request("/submissions/" + saved["submission"] + "/jobs", token=saved["token"])
    assert len(history) == 1 and retry["id"] == saved["job"], "duplicate result"
    expected = "passed" if sys.argv[2] == "verify" else "queued"
    assert history[0]["status"] == expected, history[0]["status"]
    if expected == "passed":
        asserts = history[0]["report"]["assertions"]
        assert any(item["actual"] == "Maqibu Java pilot" and item["passed"] for item in asserts)
    print("One dedicated test submission:", expected)
