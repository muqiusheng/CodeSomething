param([string]$MavenDirectory='D:/Download/apache-maven-3.9.14',
      [string]$JavaDirectory='C:/Program Files (x86)/jdk/jdk21',
      [string]$Docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe', [switch]$Jdbc, [switch]$WarmDependencies)
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$contextDirectory=Join-Path $systemDirectory ('runtime/boot-image-'+[guid]::NewGuid().ToString('N'))
$projectDirectory=Join-Path $contextDirectory 'project'
New-Item -ItemType Directory -Force $projectDirectory | Out-Null
$starter=if($Jdbc){'course-packs/boot-foundations/1.0.0/boot-jdbc/reference/src'}else{'runner/boot/starter/src'}
$pomFile=if($Jdbc){'jdbc-pom.xml'}else{'pom.xml'}
Copy-Item -LiteralPath (Join-Path $systemDirectory $starter) -Destination $projectDirectory -Recurse
Copy-Item -LiteralPath (Join-Path $systemDirectory "backend/src/main/resources/runner/boot/$pomFile") -Destination (Join-Path $projectDirectory 'pom.xml')
$env:JAVA_HOME=$JavaDirectory
$env:Path=(Join-Path $JavaDirectory 'bin')+';'+$env:Path
$mavenVersion=(& (Join-Path $MavenDirectory 'bin/mvn.cmd') --version | Out-String)
if($LASTEXITCODE -ne 0 -or $mavenVersion -notmatch 'Apache Maven 3\.9\.14\b' -or $mavenVersion -notmatch 'Java version: 21\.') {
    throw 'This runner requires Maven 3.9.14 and Java21; no image/lock was published.'
}
$repositoryDirectory=Join-Path $systemDirectory 'runtime/maven-repository'
# Trusted reference only. No learner directory or build configuration is run on the host.
$offline=if($WarmDependencies){@()}else{@('-o')}
& (Join-Path $MavenDirectory 'bin/mvn.cmd') -B -ntp @offline -s (Join-Path $PSScriptRoot 'maven-settings.xml') "-Dmaven.repo.local=$repositoryDirectory" -f (Join-Path $projectDirectory 'pom.xml') -DskipTests package
if($LASTEXITCODE -ne 0){throw 'Offline reference build failed. No image/lock was published; inspect the missing dependency or build error.'}
New-Item -ItemType Directory -Force (Join-Path $contextDirectory 'maven') | Out-Null
foreach($part in @('bin','boot','conf','lib','LICENSE','NOTICE')) {
    Copy-Item -LiteralPath (Join-Path $MavenDirectory $part) -Destination (Join-Path $contextDirectory 'maven') -Recurse
}
Copy-Item -LiteralPath $repositoryDirectory -Destination (Join-Path $contextDirectory 'repository') -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'maven-settings.xml') -Destination (Join-Path $contextDirectory 'settings.xml')
Copy-Item -LiteralPath (Join-Path $systemDirectory 'runner/boot/Dockerfile') -Destination $contextDirectory
$tag=if($Jdbc){'codesomething-boot-runner:r33-jdbc'}else{'codesomething-boot-runner:r331'}
& $Docker build --network=none --pull=false --tag $tag $contextDirectory
if($LASTEXITCODE -ne 0){throw 'Docker image build failed. No lock was published.'}
$imageId=(& $Docker image inspect --format '{{.Id}}' $tag).Trim()
if($LASTEXITCODE -ne 0 -or $imageId -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Expected a full local content-addressed image ID.'}
$entries=@(Get-ChildItem -LiteralPath (Join-Path $contextDirectory 'repository') -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=[IO.Path]::GetRelativePath((Join-Path $contextDirectory 'repository'),$_.FullName).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$manifestPath=Join-Path $systemDirectory $(if($Jdbc){'runner/boot/jdbc-dependencies.lock.json'}else{'runner/boot/dependencies.lock.json'})
$entries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$lock=[ordered]@{image=$imageId;baseImage='eclipse-temurin@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69';java=21;maven='3.9.14';springBoot='4.1.2';pomDigest=(Get-FileHash -LiteralPath (Join-Path $projectDirectory 'pom.xml')).Hash.ToLowerInvariant();dependencyManifestDigest=(Get-FileHash -LiteralPath $manifestPath).Hash.ToLowerInvariant();repositoryFiles=$entries.Count}
$lockFile=if($Jdbc){'jdbc-image-lock.json'}else{'image-lock.json'}
$lock | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $systemDirectory "backend/src/main/resources/runner/boot/$lockFile") -Encoding utf8NoBOM
Write-Output "Boot runner ready: $imageId"
Write-Output "Build context retained for inspection: $contextDirectory"
