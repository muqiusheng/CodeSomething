param([string]$ReleasePointer='r6-preview-jar.txt',[switch]$BackendOnly)
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$ports=if($BackendOnly){@(5191)}else{@(5191,5179)}
foreach($port in $ports){if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Port $port is in use."}}
$jar=(Get-Content -LiteralPath (Join-Path $systemDirectory "runtime/$ReleasePointer") -Raw).Trim()
$codexBinary='C:/Users/lenovo/AppData/Local/OpenAI/Codex/bin/9e1da79431da526b/codex.exe'
$arguments='-jar "{0}" --server.port=5191 --cs.data-directory="{1}/runtime/r6-acceptance/data" --cs.course-directory="{1}/course-packs" --cs.frontend-origin=http://127.0.0.1:5179 --cs.runner.enabled=false --cs.tutor.binary="{2}"' -f $jar,$systemDirectory,$codexBinary
$backend=Start-Process -WindowStyle Hidden -FilePath 'C:/Program Files (x86)/jdk/jdk21/bin/java.exe' -ArgumentList $arguments -WorkingDirectory $systemDirectory -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/r6-acceptance.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/r6-acceptance-error.log')
$backend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r6-acceptance.pid')
if($BackendOnly){Write-Output "Acceptance backend $($backend.Id)";exit 0}
$env:CS_BACKEND_URL='http://127.0.0.1:5191'
$frontend=Start-Process -WindowStyle Hidden -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5179','--strictPort') -WorkingDirectory (Join-Path $systemDirectory 'frontend') -PassThru -RedirectStandardOutput (Join-Path $systemDirectory 'runtime/r6-front.log') -RedirectStandardError (Join-Path $systemDirectory 'runtime/r6-front-error.log')
$frontend.Id | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r6-front.pid')
Write-Output "Acceptance backend $($backend.Id), frontend $($frontend.Id)"
