#!/usr/bin/env python3
"""Verify that SQL downtime leaves the dedicated learner's login and drafts working."""
from pathlib import Path
import json
import runpy
import sys

qa = runpy.run_path(str(Path(sys.argv[1])))
credentials = json.loads(qa["TEST_ACCOUNT"].read_text())
api = qa["request"]
student = api("/api/v1/auth/login", {field: credentials[field] for field in ("username", "password")})
token = student["token"]
assert student["role"] == "ROLE_STUDENT"
route = "/api/school/courses/database-systems/labs/lab-03-single-query"
details = api(route, learner=token)
code = "SELECT 1 AS migration_availability_check;"
question = "q02"
draft = api(route + "/save", {"revision": details["work"]["revision"], "drafts": {question: code}}, token)
response = api(route + "/grade", {"revision": draft["revision"], "questionId": question, "drafts": {question: code}}, token)
assert response["work"]["executions"][question]["grade"]["status"] == "unavailable"
details = api(route, learner=token)
assert details["work"]["drafts"][question] == code
api("/api/v1/auth/logout", {}, token)
print("MySQL unavailable: login, save, and reread worked; only SQL grading was unavailable")
