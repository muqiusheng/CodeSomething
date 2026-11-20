$ErrorActionPreference='Stop'
$systemDirectory=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$rootDirectory=Split-Path $systemDirectory -Parent
$docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
$id=(Get-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r6-real-draft.txt') -Raw).Trim()
$api='http://127.0.0.1:5191/api/v1/projects'
$draft=Invoke-RestMethod "$api/drafts/$id"
$before=Invoke-RestMethod "$api/courses/$id"
$body=@{stage='validate';files=$draft.payload.chapters[1].reference;idempotencyKey='r6-forced-restart-1'} | ConvertTo-Json -Depth 20
$attempt=Invoke-RestMethod -Method Post "$api/courses/$id/checks" -ContentType 'application/json' -Body $body
$runnerDirectory=Join-Path $systemDirectory 'runtime/r6-acceptance/data/generated-runner'
$serialized=$runnerDirectory | ConvertTo-Json -Compress
$scope=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($serialized))).ToLowerInvariant()
$containerId=''
for($i=0;$i -lt 100;$i++){
 $containerId=(& $docker ps -q --filter "label=codesomething.r6-scope=$scope") -join ''
 if($containerId){break}
 Start-Sleep -Milliseconds 200
}
if(-not $containerId){throw 'No owned running container observed; recovery evidence was not established.'}
$info=(& $docker inspect $containerId | ConvertFrom-Json)[0]
$recordedProcess=[int](Get-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r6-acceptance.pid'))
$listener=Get-NetTCPConnection -State Listen -LocalPort 5191
if($listener.OwningProcess -ne $recordedProcess){throw 'Listener no longer matches the acceptance process.'}
Stop-Process -Id $recordedProcess -Force
Push-Location $rootDirectory
try { & (Join-Path $systemDirectory 'tooling/start-r6-acceptance.ps1') -ReleasePointer r6-final-jar.txt -BackendOnly } finally { Pop-Location }
for($i=0;$i -lt 100;$i++){
 try{Invoke-RestMethod 'http://127.0.0.1:5191/api/v1/health' | Out-Null;break}catch{Start-Sleep -Milliseconds 200}
}
$after=Invoke-RestMethod "$api/courses/$id"
$recovered=Invoke-RestMethod "$api/checks/$($attempt.id)"
$repeated=Invoke-RestMethod -Method Post "$api/courses/$id/checks" -ContentType 'application/json' -Body $body
for($i=0;$i -lt 100;$i++){
 $remaining=(& $docker ps -aq --filter "label=codesomething.r6-scope=$scope") -join ''
 if(-not $remaining){break}
 Start-Sleep -Milliseconds 200
}
if($remaining){throw 'Owned container remains after recovery.'}
if($recovered.status -ne 'interrupted'){throw 'Active job was not marked interrupted.'}
if($repeated.id -ne $attempt.id){throw 'Retry created a duplicate attempt.'}
if(($before.completions | ConvertTo-Json -Compress) -ne ($after.completions | ConvertTo-Json -Compress)){throw 'Published learning completion changed across restart.'}
$evidence=@{attemptId=$attempt.id;status=$recovered.status;sameIdempotentAttempt=($repeated.id -eq $attempt.id);completionsPreserved=$true;ownedContainerRemoved=$true;container=@{image=$info.Config.Image;user=$info.Config.User;network=$info.HostConfig.NetworkMode;readOnly=$info.HostConfig.ReadonlyRootfs;memory=$info.HostConfig.Memory;cpus=$info.HostConfig.NanoCpus;pids=$info.HostConfig.PidsLimit;capDrop=$info.HostConfig.CapDrop;security=$info.HostConfig.SecurityOpt};beforeAttemptCount=$before.attempts.Count;afterAttemptCount=$after.attempts.Count}
$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $systemDirectory 'docs/acceptance/R6/restart-recovery.json') -Encoding utf8NoBOM
$evidence | ConvertTo-Json -Depth 10
