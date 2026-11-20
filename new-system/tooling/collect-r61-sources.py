"""Read-only upstream capture. Writes a new research run; never executes upstream code."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import urllib.request

REPOSITORIES = (
    'spring-projects/spring-petclinic',
    'spring-petclinic/spring-petclinic-rest',
    'spring-guides/gs-relational-data-access',
)
SOURCE_SUFFIXES = ('/OwnerController.java', '/OwnerRepository.java', '/ClinicServiceImpl.java', '/SecurityConfig.java')

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CodeSomething-R61-Research', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()

def capture(repository, target):
    folder = target / repository.replace('/', '--')
    folder.mkdir()
    records = []
    def save(url, name):
        data = fetch(url)
        (folder / name).write_bytes(data)
        records.append({'url': url, 'file': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        return data
    try:
        metadata = json.loads(save(f'https://api.github.com/repos/{repository}', 'repository.json'))
        commit = json.loads(save(f'https://api.github.com/repos/{repository}/commits/{metadata["default_branch"]}', 'commit.json'))
        sha = commit['sha']
        tree = json.loads(save(f'https://api.github.com/repos/{repository}/git/trees/{sha}?recursive=1', 'tree.json'))
        if tree.get('truncated'):
            raise ValueError('Truncated source tree')
        paths = [item['path'] for item in tree['tree'] if item['type'] == 'blob']
        selected = [p for p in paths if p.lower() in ('readme.md', 'readme.adoc', 'license', 'license.txt', 'license.adoc', 'notice.txt', 'pom.xml', 'complete/pom.xml')]
        selected += [p for p in paths if p.endswith(SOURCE_SUFFIXES) or p.startswith('complete/src/main/java/') and p.endswith('.java')]
        for name in selected:
            save(f'https://raw.githubusercontent.com/{repository}/{sha}/{name}', name.replace('/', '--'))
        result = {'repository': repository, 'status': 'captured', 'commit': sha, 'commitDate': commit['commit']['committer']['date'], 'records': records}
    except Exception as error:
        result = {'repository': repository, 'status': 'failed', 'error': str(error), 'records': records}
    (folder / 'capture.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='New, empty run directory')
    args = parser.parse_args()
    target = Path(args.output).resolve()
    target.mkdir(parents=True, exist_ok=False)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(lambda repo: capture(repo, target), REPOSITORIES))
    report = {'startedAt': started, 'capability': 'Python urllib HTTPS / GitHub REST and raw files', 'results': results}
    (target / 'capture-index.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps([{'repository': r['repository'], 'status': r['status'], 'error': r.get('error')} for r in results]))
    return 0 if all(r['status'] == 'captured' for r in results) else 1

if __name__ == '__main__':
    raise SystemExit(main())
