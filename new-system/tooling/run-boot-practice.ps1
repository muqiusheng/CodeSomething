param([Parameter(Mandatory)][string]$ProjectDirectory)
$ErrorActionPreference='Stop'
$configPath=Join-Path $PSScriptRoot 'config.json'
if(-not (Test-Path -LiteralPath $configPath)){throw 'Run the generated runtime/boot-practice/run.ps1 after starting the practice environment.'}
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if(-not [IO.Path]::IsPathRooted($ProjectDirectory) -or -not (Test-Path -LiteralPath (Join-Path $ProjectDirectory 'pom.xml'))){throw 'Choose the absolute directory of your Maven project.'}
$env:SPRING_DATASOURCE_URL=$config.url;$env:SPRING_DATASOURCE_USERNAME=$config.username;$env:SPRING_DATASOURCE_PASSWORD=$config.password;$env:SPRING_SQL_INIT_MODE='never'
$env:JAVA_HOME='C:/Program Files (x86)/jdk/jdk21';$env:Path=(Join-Path $env:JAVA_HOME 'bin')+';'+$env:Path
& 'D:/Download/apache-maven-3.9.14/bin/mvn.cmd' -B -ntp -s (Join-Path $config.systemDirectory 'tooling/maven-settings.xml') "-Dmaven.repo.local=$(Join-Path $config.systemDirectory 'runtime/maven-repository')" -f (Join-Path $ProjectDirectory 'pom.xml') spring-boot:run
exit $LASTEXITCODE
