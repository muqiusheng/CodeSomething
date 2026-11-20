$ErrorActionPreference='Stop'
$systemDirectory=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$rootDirectory=Split-Path $systemDirectory -Parent
$pointer=Join-Path $systemDirectory 'runtime/current-backend-jar.txt'
$previous=(Get-Content -LiteralPath $pointer -Raw).Trim()
$release=(Get-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r6-release-jar.txt') -Raw).Trim()
if(-not(Test-Path -LiteralPath $release)){throw 'Final release does not exist.'}
$listener=Get-NetTCPConnection -State Listen -LocalPort 5188 -ErrorAction Stop
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if($process.Name -ne 'java.exe' -or -not $process.CommandLine.Contains($previous)){throw 'Daily listener does not match the known release pointer.'}
Push-Location $rootDirectory
try{
    $active=@'
import sqlite3,sys
with sqlite3.connect('new-system/runtime/data/codesomething.db') as db:
    active=sum(db.execute("SELECT count(*) FROM "+table+" WHERE status IN ('queued','running','cancelling')").fetchone()[0] for table in ('check_jobs','sql_attempts','tutor_requests'))
    print(active)
    sys.exit(1 if active else 0)
'@ | python -
    if($LASTEXITCODE -ne 0){throw 'An original learning job is active; keep the running daily backend.'}
    Stop-Process -Id $listener.OwningProcess
    $backup=Join-Path $systemDirectory ('runtime/backups/pre-r6-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db')
    & python (Join-Path $PSScriptRoot 'check-r6-upgrade.py') prepare --data (Join-Path $systemDirectory 'runtime/data/codesomething.db') --record (Join-Path $systemDirectory 'docs/acceptance/R6/daily-baseline.json') --copy $backup
    if($LASTEXITCODE -ne 0){throw 'Daily backup failed.'}
    $release | Set-Content -LiteralPath $pointer -Encoding utf8NoBOM
    & (Join-Path $systemDirectory 'tooling/start-release.ps1') -Mode daily
    for($i=0;$i -lt 100;$i++){
        try{Invoke-RestMethod 'http://127.0.0.1:5188/api/v1/health' | Out-Null;break}catch{Start-Sleep -Milliseconds 200}
    }
    & python (Join-Path $PSScriptRoot 'check-r6-upgrade.py') verify --data (Join-Path $systemDirectory 'runtime/data/codesomething.db') --record (Join-Path $systemDirectory 'docs/acceptance/R6/daily-baseline.json')
    if($LASTEXITCODE -ne 0){throw 'Daily data verification failed; inspect the recorded backup before further writes.'}
    $courses=Invoke-RestMethod 'http://127.0.0.1:5188/api/v1/projects/courses'
    $drafts=Invoke-RestMethod 'http://127.0.0.1:5188/api/v1/projects/drafts'
    if($courses.Count -ne 0 -or $drafts.Count -ne 0){throw 'Acceptance project data entered the daily database.'}
    $connection=Invoke-RestMethod -Method Post 'http://127.0.0.1:5188/api/v1/tutor/connection' -ContentType 'application/json' -Body '{}'
    @{jar=$release;sha256=(Get-FileHash -LiteralPath $release -Algorithm SHA256).Hash.ToLowerInvariant();previousJar=$previous;backup=$backup;frontend='0.15.0';schema='12';originalTablesIdentical=$true;acceptanceProjectsInDaily=0;chatgptStatus=$connection.status} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $systemDirectory 'docs/acceptance/R6/release.json') -Encoding utf8NoBOM
    Write-Output "Daily upgrade verified; ChatGPT: $($connection.status)"
}finally{Pop-Location}
