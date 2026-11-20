param(
    [ValidateSet('start','stop','status')][string]$Action='status',
    [string]$ProjectDirectory,
    [ValidateRange(1024,65535)][int]$Port=5197,
    [ValidatePattern('^[a-z][a-z0-9-]{0,24}$')][string]$Instance='practice',
    [string]$Docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
)
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$deploymentDirectory=Join-Path $systemDirectory "runtime/r8-deploy/$Instance"
$appName="cs-r8-$Instance-app";$dbName="cs-r8-$Instance-db";$networkName="cs-r8-$Instance-net";$volumeName="cs-r8-$Instance-data"
$ownerLabel="codesomething.r8-deploy=$Instance"
function Invoke-Docker([string[]]$Arguments){
    $result=& $Docker @Arguments 2>&1 | Out-String
    if($LASTEXITCODE -ne 0){throw "R8 Docker operation failed: $($Arguments[0]). Check runtime/r8-deploy/$Instance and Docker status."}
    return $result.Trim()
}
function Inspect-Owned([string]$Kind,[string]$Name){
    $result=& $Docker $Kind inspect $Name 2>$null | Out-String
    if($LASTEXITCODE -ne 0){return $null}
    $record=($result | ConvertFrom-Json)[0]
    $labels=if($Kind -eq 'container'){$record.Config.Labels}else{$record.Labels}
    if($labels.'codesomething.r8-deploy' -ne $Instance){throw "Refusing to manage a resource with another owner: $Name"}
    return $record
}
if($Action -eq 'stop'){
    foreach($name in @($appName,$dbName)){if(Inspect-Owned 'container' $name){Invoke-Docker @('stop','--time=10',$name) | Out-Null}}
    Write-Output "Stopped instance $Instance. Database volume $volumeName was preserved."
    exit 0
}
if($Action -eq 'status'){
    foreach($name in @($appName,$dbName)){
        $info=Inspect-Owned 'container' $name
        Write-Output "$name : $(if($info){$info.State.Status}else{'not created'})"
    }
    if(Test-Path -LiteralPath (Join-Path $deploymentDirectory 'config.json')){
        $config=Get-Content -LiteralPath (Join-Path $deploymentDirectory 'config.json') -Raw | ConvertFrom-Json
        try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$($config.port)/api/health" -TimeoutSec 4;Write-Output "health: $($health.status) at http://127.0.0.1:$($config.port)/"}catch{Write-Output 'health: unavailable (check container state, startup log and port)'}
    }
    exit 0
}
if(-not $ProjectDirectory){throw 'start requires an absolute -ProjectDirectory containing the learner Maven project.'}
$ProjectDirectory=[IO.Path]::GetFullPath($ProjectDirectory)
if(-not (Test-Path -LiteralPath (Join-Path $ProjectDirectory 'pom.xml'))){throw 'Project must contain pom.xml.'}
$expectedPom=[IO.File]::ReadAllText((Join-Path $systemDirectory 'backend/src/main/resources/runner/boot/jdbc-pom.xml')).Replace("`r`n","`n")
if([IO.File]::ReadAllText((Join-Path $ProjectDirectory 'pom.xml')).TrimStart([char]0xFEFF).Replace("`r`n","`n") -cne $expectedPom){throw 'Restore the fixed course pom.xml before deployment.'}
New-Item -ItemType Directory -Force -Path $deploymentDirectory | Out-Null
$configPath=Join-Path $deploymentDirectory 'config.json'
$schemaPath=Join-Path $systemDirectory 'backend/src/main/resources/runner/portfolio/seed.sql'
$schemaDigest=(Get-FileHash -LiteralPath $schemaPath -Algorithm SHA256).Hash
if(Test-Path -LiteralPath $configPath){
    $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if($config.schemaDigest -ne $schemaDigest){throw 'Deployment schema differs; use a new Instance to preserve existing data.'}
    if($config.password -notmatch '^[a-f0-9]{32}$'){throw 'Invalid deployment credential format.'}
    $Port=$config.port
}else{
    $config=[ordered]@{port=$Port;password=[guid]::NewGuid().ToString('N');schemaDigest=$schemaDigest}
    $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
}
$lock=Get-Content -LiteralPath (Join-Path $systemDirectory 'backend/src/main/resources/runner/boot/jdbc-image-lock.json') -Raw | ConvertFrom-Json
$mysqlImage='mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902'
$network=Inspect-Owned 'network' $networkName
if($network -and $network.Internal){throw 'This instance uses a checker-only internal network. Choose a new deployment Instance for host browser access.'}
if(-not $network){Invoke-Docker @('network','create','--label',$ownerLabel,$networkName) | Out-Null}
if(-not (Inspect-Owned 'volume' $volumeName)){Invoke-Docker @('volume','create','--label',$ownerLabel,$volumeName) | Out-Null}
$db=Inspect-Owned 'container' $dbName
if($db -and $db.Config.Image -ne $mysqlImage){throw 'Existing database image differs from the fixed R8 image.'}
if(-not $db){
    Invoke-Docker @('create','--name',$dbName,'--label',$ownerLabel,'--pull=never','--network',$networkName,'--network-alias=database','--memory=640m','--memory-swap=640m','--cpus=1','--pids-limit=256','--mount',"type=volume,source=$volumeName,target=/var/lib/mysql",'--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes','--env=MYSQL_ROOT_HOST=localhost','--log-opt=max-size=2m','--log-opt=max-file=2',$mysqlImage,'--local-infile=0','--performance-schema=OFF','--innodb-buffer-pool-size=64M') | Out-Null
}
Invoke-Docker @('start',$dbName) | Out-Null
$ready=$false
for($attempt=0;$attempt -lt 100;$attempt++){
    & $Docker exec $dbName mysql -uroot --protocol=socket -e 'SELECT 1;' *> $null
    if($LASTEXITCODE -eq 0){$ready=$true;break}
    Start-Sleep -Milliseconds 300
}
if(-not $ready){throw 'R8 MySQL is not ready. This is an environment failure; check Docker logs.'}
$exists=Invoke-Docker @('exec',$dbName,'mysql','-uroot','-N','-e',"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cs_lab' AND table_name='users';")
if($exists -eq '0'){
    $sql="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE IF NOT EXISTS cs_lab CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'learner'@'%' IDENTIFIED BY '$($config.password)'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON cs_lab.* TO 'learner'@'%'; USE cs_lab; "+[IO.File]::ReadAllText($schemaPath)
    Invoke-Docker @('exec',$dbName,'mysql','-uroot','--default-character-set=utf8mb4','-e',$sql) | Out-Null
}
# Copy the same declared flat Java scope as the checker; never upload IDE metadata or credentials.
$inputDirectory=Join-Path $deploymentDirectory ('input-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $inputDirectory | Out-Null
$relativeFiles=@('pom.xml')
foreach($folder in @('src/main/java/dev/codesomething/lab','src/test/java/dev/codesomething/lab')){
    $current=$ProjectDirectory
    foreach($segment in $folder.Split('/')){
        $current=Join-Path $current $segment
        if(Test-Path -LiteralPath $current){if((Get-Item -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked directories are not supported.'}}
    }
    if(Test-Path -LiteralPath $current){foreach($file in Get-ChildItem -LiteralPath $current -File){if($file.Name -notmatch '^[A-Za-z][A-Za-z0-9]*\.java$'){throw 'Only declared flat Java files are supported.'};$relativeFiles+=($folder+'/'+$file.Name)}}
}
if(Test-Path -LiteralPath (Join-Path $ProjectDirectory 'RUN.md')){$relativeFiles+='RUN.md'}
if($relativeFiles.Count -gt 35){throw 'Too many files.'}
$sourceBytes=0
foreach($relative in $relativeFiles){
    $original=Get-Item -LiteralPath (Join-Path $ProjectDirectory $relative)
    if(($original.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $original.Length -gt 65536){throw 'Linked or oversized source file.'}
    $sourceBytes+=$original.Length
    if($sourceBytes -gt 524288){throw 'Source exceeds 512KiB.'}
    $target=Join-Path $inputDirectory $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item -LiteralPath $original.FullName -Destination $target
}
# Build offline with read-only source and no external network. Only the resulting JAR leaves the container.
Invoke-Docker @('run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--memory=640m','--cpus=1','--pids-limit=128','--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777','--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp','--mount',"type=bind,source=$inputDirectory,target=/input,readonly",'--mount',"type=bind,source=$deploymentDirectory,target=/output",$lock.image,'sh','-c','cp -R /input /tmp/project && cd /tmp/project && sh /opt/maven/bin/mvn -B -ntp -o -s /opt/settings.xml -Dmaven.repo.local=/opt/repository -Dmaven.compiler.proc=none -DskipTests package > /output/build.log 2>&1 && cp target/boot-lab.jar /output/boot-lab.jar') | Out-Null
if(Inspect-Owned 'container' $appName){Invoke-Docker @('rm','-f',$appName) | Out-Null}
Invoke-Docker @('run','-d','--name',$appName,'--label',$ownerLabel,'--pull=never','--network',$networkName,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--memory=384m','--memory-swap=384m','--cpus=1','--pids-limit=128','--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777','--publish',"127.0.0.1:${Port}:8080",'--mount',"type=bind,source=$deploymentDirectory/boot-lab.jar,target=/app.jar,readonly",'--env=SPRING_DATASOURCE_URL=jdbc:mysql://database:3306/cs_lab?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8','--env=SPRING_DATASOURCE_USERNAME=learner',"--env=SPRING_DATASOURCE_PASSWORD=$($config.password)",'--log-opt=max-size=2m','--log-opt=max-file=2',$lock.image,'java','-Xmx192m','-XX:ActiveProcessorCount=1','-jar','/app.jar','--server.port=8080','--server.address=0.0.0.0') | Out-Null
for($attempt=0;$attempt -lt 70;$attempt++){
    try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2;if($health.status -eq 'ok'){Write-Output "R8 ready: http://127.0.0.1:$Port/ (instance $Instance, persistent isolated database)";exit 0}}catch{}
    Start-Sleep -Milliseconds 300
}
throw 'R8 application did not become healthy. Check build.log, docker logs, database configuration and port; learning completion is unchanged.'
