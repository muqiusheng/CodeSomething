"""Exercise native checks through a separately started release JAR, using only acceptance data."""
import argparse
import json
from pathlib import Path
import time
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:5189/api/v1')
parser.add_argument('--evidence', default='new-system/docs/acceptance/local-first-runner/release-smoke.json')
args = parser.parse_args()

def call(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(args.base + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)

for attempt in range(100):
    try:
        assert call('GET', '/health')['status'] == 'UP'
        break
    except Exception:
        if attempt == 99:
            raise
        time.sleep(.2)

evidence = []
def submit(course, version, stage, files, expected, title):
    draft = call('POST', '/browser-workspaces', {'courseId': course, 'courseVersion': version, 'stageId': stage, 'clientKey': uuid.uuid4().hex})
    token, binding = draft['token'], draft['id']
    saved = call('POST', f'/browser-workspaces/{binding}/draft', {'expectedRevision': 0, 'files': files}, token)
    submission = call('POST', '/submissions', {'bindingId': binding, 'expectedDigest': saved['digest']}, token)
    started = time.monotonic()
    job = call('POST', '/check-jobs', {'submissionId': submission['id'], 'idempotencyKey': uuid.uuid4().hex}, token)
    deadline = started + 150
    while job['status'] in ('queued', 'running', 'cancelling'):
        if time.monotonic() > deadline:
            raise TimeoutError(title)
        time.sleep(.1)
        job = call('GET', '/jobs/' + job['id'], token=token)
    assert job['status'] == expected, job
    assert job['report']['image'].startswith('local-jdk:'), job
    assert job['report']['snapshotDigest'] == saved['digest'], job
    evidence.append({'case': title, 'seconds': round(time.monotonic()-started, 3), 'job': job})
    print(title, expected, evidence[-1]['seconds'], flush=True)

root = Path(__file__).resolve().parents[3]
source = (root / 'new-system/course-packs/http-json-basics/1.0.0/TaskServer.java').read_text(encoding='utf-8')
source = source.replace('"completed":"false"', '"completed":false').replace('status = 200;\n                body', 'status = 404;\n                body')
submit('http-json-basics', '1.1.0', 'fix-response', {'TaskServer.java': source}, 'passed', 'HTTP native')

pom = '''<project><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.0.9</version><relativePath/></parent><groupId>com.example</groupId><artifactId>native-learning</artifactId><version>1.0.0</version><properties><java.version>21</java.version></properties><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies><build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>'''
files = {
    'pom.xml': pom,
    'src/main/java/com/example/NativeApplication.java': 'package com.example; @org.springframework.boot.autoconfigure.SpringBootApplication public class NativeApplication {public static void main(String[] args){org.springframework.boot.SpringApplication.run(NativeApplication.class,args);}}',
    'src/main/java/com/example/HealthController.java': 'package com.example; @org.springframework.web.bind.annotation.RestController public class HealthController {@org.springframework.beans.factory.annotation.Value("${check.status}") String status; @org.springframework.web.bind.annotation.GetMapping("/api/health") public java.util.Map<String,String> health(){return java.util.Map.of("status",status);}}',
    'src/main/resources/application.properties': 'check.status=ok\n',
}
submit('boot-foundations', '1.0.0', 'boot-start', files, 'passed', 'Boot 4.0.9 original namespace and resource')
files['src/main/resources/application.properties'] = 'check.status=wrong\n'
submit('boot-foundations', '1.0.0', 'boot-start', files, 'business_error', 'Boot wrong business value')
files['src/main/java/com/example/HealthController.java'] = 'package com.example; public class HealthController {broken}'
submit('boot-foundations', '1.0.0', 'boot-start', files, 'compile_error', 'Boot compilation diagnostics')
destination = root / args.evidence
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
