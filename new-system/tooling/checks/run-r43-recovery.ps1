$ErrorActionPreference='Stop'
$systemDirectory=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$taskDirectory=Join-Path $systemDirectory ('runtime/r43-acceptance-'+[guid]::NewGuid().ToString('N'))
$env:CS_R43_ACCEPTANCE_DIRECTORY=$taskDirectory
$env:CS_R43_CLASSES_DIRECTORY=Get-ChildItem -LiteralPath (Join-Path $systemDirectory 'idea-plugin/build/local') -Directory -Filter 'test-*' |
    Sort-Object LastWriteTime -Descending | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'classes/dev/codesomething/idea/TestLauncher.class') } |
    Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName 'classes' }
$taskDirectory | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/r43-acceptance-path.txt')
$results=Join-Path $taskDirectory 'results'
New-Item -ItemType Directory -Force $results,(Join-Path $taskDirectory 'data'),(Join-Path $taskDirectory 'idea-sandbox') | Out-Null
if(Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue){throw '5191 already occupied'}
Copy-Item -LiteralPath (Join-Path $systemDirectory 'course-packs/boot-foundations/1.0.0/boot-start/reference') -Destination (Join-Path $taskDirectory 'practice') -Recurse
# Remove copied IDE metadata only in the newly created acceptance fixture.
$metadata=Join-Path $taskDirectory 'practice/.idea'
if(Test-Path -LiteralPath $metadata){
    if(-not ([IO.Path]::GetFullPath($metadata).StartsWith([IO.Path]::GetFullPath($taskDirectory)))){throw 'Fixture outside task directory'}
    Remove-Item -LiteralPath $metadata -Recurse -Force
}
$options=Join-Path $taskDirectory 'idea-sandbox/config/options'
New-Item -ItemType Directory -Force $options | Out-Null
'<application><component name="Registry"><entry key="ide.experimental.ui.onboarding" value="false" source="SYSTEM" /></component><component name="GeneralSettings"><option name="confirmExit" value="false" /></component></application>' | Set-Content -LiteralPath (Join-Path $options 'ide.general.xml') -Encoding utf8NoBOM
function Start-TestBackend {
    $backendProcess=Start-Process -WindowStyle Hidden -FilePath 'C:/Program Files (x86)/jdk/jdk21/bin/java.exe' -ArgumentList @(
        '-jar',('"'+(Join-Path $systemDirectory 'backend/target/codesomething-backend-0.1.0.jar')+'"'),
        '--server.port=5191',('--cs.data-directory="'+(Join-Path $taskDirectory 'data')+'"'),
        ('--cs.course-directory="'+(Join-Path $systemDirectory 'course-packs')+'"'),'--cs.frontend-origin=http://127.0.0.1:5179'
    ) -RedirectStandardOutput (Join-Path $taskDirectory ('backend-'+[guid]::NewGuid().ToString('N')+'.log')) -RedirectStandardError (Join-Path $taskDirectory ('backend-error-'+[guid]::NewGuid().ToString('N')+'.log')) -PassThru
    $script:backendPid=$backendProcess.Id
    $deadline=(Get-Date).AddSeconds(60)
    do {
        try { $health=Invoke-RestMethod 'http://127.0.0.1:5191/api/v1/health'; if($health){return} } catch {}
        Start-Sleep -Milliseconds 500
    } while((Get-Date) -lt $deadline)
    throw 'Test backend failed to start'
}
function Wait-File([string]$Name) {
    $deadline=(Get-Date).AddSeconds(200)
    $path=Join-Path $results $Name
    while(-not (Test-Path -LiteralPath $path)) {
        if((Get-Date) -gt $deadline){throw "Timed out: $Name"}
        Start-Sleep -Milliseconds 500
    }
    if($Name.EndsWith('.json')) {
        $result=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if($result.status -ne 'passed'){throw ($result | ConvertTo-Json -Compress)}
    }
}
function Stop-TestIde {
    $idePidFile=Join-Path $taskDirectory 'idea-sandbox/idea.pid'
    if(Test-Path -LiteralPath $idePidFile) {
        $idePid=[int](Get-Content -LiteralPath $idePidFile)
        $process=Get-CimInstance Win32_Process -Filter "ProcessId=$idePid"
        if($process -and $process.CommandLine.Contains($taskDirectory)){
            Wait-Process -Id $idePid -Timeout 30 -ErrorAction SilentlyContinue
            if(Get-Process -Id $idePid -ErrorAction SilentlyContinue){Stop-Process -Id $idePid -Force}
            Start-Sleep -Seconds 2
        }
    }
}
try {
    Start-TestBackend
    & (Join-Path $systemDirectory 'tooling/run-r43-idea-sandbox.ps1') -Phase prepare
    Wait-File 'prepare-result.json'
    Stop-TestIde
    & (Join-Path $systemDirectory 'tooling/run-r43-idea-sandbox.ps1') -Phase restore
    Wait-File 'outage-ready'
    Stop-Process -Id $script:backendPid -Force
    Wait-File 'outage-observed'
    Start-TestBackend
    Wait-File 'restore-result.json'
    Stop-TestIde
    $original=Join-Path $taskDirectory 'practice'
    $moved=Join-Path $taskDirectory 'practice-moved'
    foreach($target in @($original,$moved)){if(-not ([IO.Path]::GetFullPath($target).StartsWith([IO.Path]::GetFullPath($taskDirectory)))){throw 'Move outside fixture'}}
    Move-Item -LiteralPath $original -Destination $moved
    & (Join-Path $systemDirectory 'tooling/run-r43-idea-sandbox.ps1') -Phase moved
    Wait-File 'moved-result.json'
    Stop-TestIde
    & (Join-Path $systemDirectory 'tooling/run-r43-idea-sandbox.ps1') -Phase prepare-pending
    Wait-File 'prepare-pending-result.json'
    Stop-TestIde
    & (Join-Path $systemDirectory 'tooling/run-r43-idea-sandbox.ps1') -Phase restore-pending
    Wait-File 'restore-pending-result.json'
} finally {
    Stop-TestIde
    if($script:backendPid){Stop-Process -Id $script:backendPid -Force -ErrorAction SilentlyContinue}
}
Write-Output 'R4.3 real IDE recovery, outage, movement and local forget passed.'
