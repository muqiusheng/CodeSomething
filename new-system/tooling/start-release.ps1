param([ValidateSet('daily','acceptance')][string]$Mode='daily')
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$releasePointer=Join-Path $systemDirectory 'runtime/current-backend-jar.txt'
if(-not (Test-Path -LiteralPath $releasePointer)){$releasePointer=Join-Path $systemDirectory 'runtime/r33-release-jar.txt'}
$jar=(Get-Content -LiteralPath $releasePointer -Raw).Trim()
if(-not (Test-Path -LiteralPath $jar)){throw 'Build the release and set runtime/current-backend-jar.txt first.'}
$port=if($Mode -eq 'daily'){5188}else{5189}
$front=if($Mode -eq 'daily'){5178}else{5179}
$data=Join-Path $systemDirectory $(if($Mode -eq 'daily'){'runtime/data'}else{'runtime/r33-acceptance-data'})
$container=if($Mode -eq 'daily'){'cs-sql-learning'}else{'cs-sql-r33-acceptance'}
if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Port $port is already in use. Preserve the running service or stop its verified process first."}
$arguments='-jar "{0}" --server.port={1} --cs.data-directory="{2}" --cs.course-directory="{3}" --cs.frontend-origin=http://127.0.0.1:{4} --cs.sql.container={5}' -f $jar,$port,$data,(Join-Path $systemDirectory 'course-packs'),$front,$container
$ideExecutable=$env:CS_IDEA_EXECUTABLE
if(-not $ideExecutable){
    $ideDirectory=if($env:CS_IDEA_HOME){$env:CS_IDEA_HOME}else{'D:/Download/IntelliJ IDEA 2026.2'}
    $candidate=Join-Path $ideDirectory 'bin/idea64.exe'
    if(Test-Path -LiteralPath $candidate){$ideExecutable=$candidate}
}
if($ideExecutable){$arguments+=' --cs.ide.executable="'+$ideExecutable+'"'}
$codexBinary=$env:CS_CODEX_BIN
if(-not $codexBinary){$codexCommand=Get-Command codex -ErrorAction SilentlyContinue;if($codexCommand){$codexBinary=$codexCommand.Source}}
if(-not $codexBinary){$codexBinary=Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin/*/codex.exe') -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName}
if($codexBinary){$arguments+=' --cs.tutor.binary="'+$codexBinary+'"'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$process=Start-Process -FilePath 'C:/Program Files (x86)/jdk/jdk21/bin/java.exe' -ArgumentList $arguments -WorkingDirectory $systemDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $systemDirectory "runtime/$Mode-$stamp.log") -RedirectStandardError (Join-Path $systemDirectory "runtime/$Mode-$stamp-error.log")
$process.Id | Set-Content -LiteralPath (Join-Path $systemDirectory "runtime/$Mode-backend.pid")
Write-Output "Started $Mode backend: process $($process.Id), port $port"
