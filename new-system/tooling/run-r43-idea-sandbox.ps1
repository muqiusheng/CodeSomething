param([string]$Phase='prepare',[string]$IdeDirectory='D:/Download/IntelliJ IDEA 2026.2')
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$taskDirectory=$env:CS_R43_ACCEPTANCE_DIRECTORY
if(-not $taskDirectory){throw 'Use tooling/checks/run-r43-recovery.ps1 to prepare an isolated run.'}
$sandboxDirectory=Join-Path $taskDirectory 'idea-sandbox'
$classesDirectory=$env:CS_R43_CLASSES_DIRECTORY
if(-not (Test-Path -LiteralPath (Join-Path $classesDirectory 'dev/codesomething/idea/SandboxRecoveryActivity.class'))){throw 'Run idea-test first.'}
$resourcesDirectory=Join-Path $taskDirectory ('smoke-resources-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force (Join-Path $resourcesDirectory 'META-INF'),(Join-Path $sandboxDirectory 'plugins/codesomething/lib') | Out-Null
# Same base-platform mode as R4.1; the plugin requires no Ultimate modules.
New-Item -ItemType Directory -Force (Join-Path $sandboxDirectory 'config') | Out-Null
'com.intellij.modules.ultimate' | Set-Content -LiteralPath (Join-Path $sandboxDirectory 'config/disabled_plugins.txt') -Encoding utf8NoBOM
$descriptor=Get-Content -LiteralPath (Join-Path $systemDirectory 'idea-plugin/src/main/resources/META-INF/plugin.xml') -Raw
$descriptor.Replace('</extensions>','<postStartupActivity implementation="dev.codesomething.idea.SandboxRecoveryActivity"/></extensions>') |
    Set-Content -LiteralPath (Join-Path $resourcesDirectory 'META-INF/plugin.xml') -Encoding utf8NoBOM
$sandboxJar=Join-Path $sandboxDirectory 'plugins/codesomething/lib/codesomething-smoke.jar'
& 'C:/Program Files (x86)/jdk/jdk21/bin/jar.exe' --create --file $sandboxJar -C $classesDirectory . -C $resourcesDirectory .
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$properties=@('idea.initially.ask.config=false','idea.trust.all.projects=true','idea.is.internal=true',
    'codesomething.backend.port=5191','codesomething.frontend.port=5179',('codesomething.acceptance.phase='+$Phase),('codesomething.acceptance.output='+(Join-Path $taskDirectory 'results').Replace('\','/')))
foreach($entry in @('config','system','plugins','log')){
    $properties+="idea.$entry.path="+(Join-Path $sandboxDirectory $entry).Replace('\','/')
}
$propertiesFile=Join-Path $sandboxDirectory 'idea.properties'
$properties | Set-Content -LiteralPath $propertiesFile -Encoding utf8NoBOM
$env:IDEA_PROPERTIES=$propertiesFile
$practiceName=if($Phase -in @('moved','prepare-pending','restore-pending')){'practice-moved'}else{'practice'}
$process=Start-Process -WindowStyle Hidden -FilePath (Join-Path $IdeDirectory 'bin/idea64.exe') -ArgumentList @(('"'+(Join-Path $taskDirectory $practiceName)+'"')) -PassThru
$process.Id | Set-Content -LiteralPath (Join-Path $sandboxDirectory 'idea.pid')
Write-Output "R4.3 sandbox launcher PID: $($process.Id)"
