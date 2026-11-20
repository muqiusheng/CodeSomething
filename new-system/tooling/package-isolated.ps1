param([string]$Label='build')
$ErrorActionPreference='Stop'
if($Label -notmatch '^[a-z0-9-]{1,30}$'){throw 'Use a short lowercase build label.'}
$systemDirectory=Split-Path $PSScriptRoot -Parent
$outputDirectory=Join-Path $systemDirectory ('runtime/'+$Label+'-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $systemDirectory 'backend/pom.xml') -Destination $outputDirectory
Copy-Item -LiteralPath (Join-Path $systemDirectory 'backend/src') -Destination $outputDirectory -Recurse
$env:JAVA_HOME='C:/Program Files (x86)/jdk/jdk21';$env:Path=(Join-Path $env:JAVA_HOME 'bin')+';'+$env:Path
& 'D:/Download/apache-maven-3.9.14/bin/mvn.cmd' -B -ntp -o -s (Join-Path $PSScriptRoot 'maven-settings.xml') "-Dmaven.repo.local=$(Join-Path $systemDirectory 'runtime/maven-repository')" -f (Join-Path $outputDirectory 'pom.xml') -DskipTests package
if($LASTEXITCODE -ne 0){throw 'Isolated package failed.'}
$jar=Join-Path $outputDirectory 'target/codesomething-backend-0.1.0.jar'
$jar | Set-Content -LiteralPath (Join-Path $systemDirectory ('runtime/'+$Label+'-jar.txt')) -Encoding utf8NoBOM
Write-Output "Packaged: $jar"
