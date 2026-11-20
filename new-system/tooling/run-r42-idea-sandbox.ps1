param([string]$IdeDirectory='D:/Download/IntelliJ IDEA 2026.2')
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$taskDirectory=Join-Path $systemDirectory 'runtime/r42-acceptance'
$sandboxDirectory=Join-Path $taskDirectory 'idea-sandbox'
$classesDirectory=Get-ChildItem -LiteralPath (Join-Path $systemDirectory 'idea-plugin/build/local') -Directory -Filter 'test-*' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName 'classes' }
if(-not (Test-Path -LiteralPath (Join-Path $classesDirectory 'dev/codesomething/idea/SandboxSmokeActivity.class'))){throw 'Run idea-test first.'}
$resourcesDirectory=Join-Path $taskDirectory ('smoke-resources-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force (Join-Path $resourcesDirectory 'META-INF'),(Join-Path $sandboxDirectory 'plugins/codesomething/lib') | Out-Null
# Same base-platform mode as R4.1; the plugin requires no Ultimate modules.
New-Item -ItemType Directory -Force (Join-Path $sandboxDirectory 'config') | Out-Null
'com.intellij.modules.ultimate' | Set-Content -LiteralPath (Join-Path $sandboxDirectory 'config/disabled_plugins.txt') -Encoding utf8NoBOM
$descriptor=Get-Content -LiteralPath (Join-Path $systemDirectory 'idea-plugin/src/main/resources/META-INF/plugin.xml') -Raw
$descriptor.Replace('</extensions>','<postStartupActivity implementation="dev.codesomething.idea.SandboxSmokeActivity"/></extensions>') |
    Set-Content -LiteralPath (Join-Path $resourcesDirectory 'META-INF/plugin.xml') -Encoding utf8NoBOM
$sandboxJar=Join-Path $sandboxDirectory 'plugins/codesomething/lib/codesomething-smoke.jar'
& 'C:/Program Files (x86)/jdk/jdk21/bin/jar.exe' --create --file $sandboxJar -C $classesDirectory . -C $resourcesDirectory .
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$properties=@('idea.initially.ask.config=false','idea.trust.all.projects=true','idea.is.internal=true',
    'codesomething.backend.port=5191','codesomething.frontend.port=5179','codesomething.acceptance.r42=true')
foreach($entry in @('config','system','plugins','log')){
    $properties+="idea.$entry.path="+(Join-Path $sandboxDirectory $entry).Replace('\','/')
}
$propertiesFile=Join-Path $sandboxDirectory 'idea.properties'
$properties | Set-Content -LiteralPath $propertiesFile -Encoding utf8NoBOM
$env:IDEA_PROPERTIES=$propertiesFile
$process=Start-Process -WindowStyle Hidden -FilePath (Join-Path $IdeDirectory 'bin/idea64.exe') -ArgumentList @(('"'+(Join-Path $taskDirectory 'practice')+'"')) -PassThru
$process.Id | Set-Content -LiteralPath (Join-Path $sandboxDirectory 'idea.pid')
Write-Output "R4.2 sandbox launcher PID: $($process.Id)"
