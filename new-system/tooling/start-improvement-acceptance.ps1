param([switch]$BackendOnly,[string]$DataName='data')
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
foreach($port in $(if($BackendOnly){@(5189)}else{@(5179,5189)})){
    if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Acceptance port $port is already occupied."}
}
$data=Join-Path $systemDirectory ('runtime/improvement-20261118/'+$DataName)
New-Item -ItemType Directory -Force -Path $data | Out-Null
$jar=Join-Path $systemDirectory 'runtime/releases/improvement-0.23.0.jar'
Copy-Item -LiteralPath (Join-Path $systemDirectory 'backend/target/codesomething-backend-0.1.0.jar') -Destination $jar
$codex=Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin/*/codex.exe') -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
$arguments='-jar "{0}" --server.port=5189 --cs.data-directory="{1}" --cs.course-directory="{2}" --cs.frontend-origin=http://127.0.0.1:5179 --cs.sql.container=cs-sql-improvement-20261118 --cs.tutor.binary="{3}"' -f $jar,$data,(Join-Path $systemDirectory 'course-packs'),$codex
$backend=Start-Process -WindowStyle Hidden -FilePath 'C:/Program Files (x86)/jdk/jdk21/bin/java.exe' -ArgumentList $arguments -WorkingDirectory $systemDirectory -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/improvement-acceptance.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/improvement-acceptance-error.log')
$backend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/improvement-acceptance.pid')
if($BackendOnly){Write-Output "Acceptance backend $($backend.Id)";exit 0}
$env:CS_BACKEND_URL='http://127.0.0.1:5189'
$frontend=Start-Process -WindowStyle Hidden -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5179','--strictPort') -WorkingDirectory (Join-Path $systemDirectory 'frontend') -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/improvement-vite.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/improvement-vite-error.log')
$frontend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/improvement-vite.pid')
Write-Output "Acceptance backend $($backend.Id), frontend $($frontend.Id)"
