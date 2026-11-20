param([switch]$BackendOnly)
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
foreach($port in $(if($BackendOnly){@(5189)}else{@(5189,5179)})){
    if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Port $port is already in use."}
}
$jar=(Get-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r8-release-jar.txt') -Raw).Trim()
$codexBinary=Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin/*/codex.exe') -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
$arguments='-jar "{0}" --server.port=5189 --cs.data-directory="{1}/runtime/r8-acceptance/data" --cs.course-directory="{1}/course-packs" --cs.frontend-origin=http://127.0.0.1:5179 --cs.sql.container=cs-sql-r8-acceptance --cs.tutor.binary="{2}"' -f $jar,$systemDirectory,$codexBinary
$backend=Start-Process -WindowStyle Hidden -FilePath 'C:/Program Files (x86)/jdk/jdk21/bin/java.exe' -ArgumentList $arguments -WorkingDirectory $systemDirectory -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/r8-acceptance.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/r8-acceptance-error.log')
$backend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r8-acceptance.pid')
if($BackendOnly){Write-Output "R8 backend process $($backend.Id)";exit 0}
$env:CS_BACKEND_URL='http://127.0.0.1:5189'
$frontend=Start-Process -WindowStyle Hidden -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5179','--strictPort') -WorkingDirectory (Join-Path $systemDirectory 'frontend') -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/r8-vite.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/r8-vite-error.log')
$frontend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r8-vite.pid')
Write-Output "R8 acceptance processes: backend $($backend.Id), frontend $($frontend.Id)"
