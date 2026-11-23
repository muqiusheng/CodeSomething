param([string]$Docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe')
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$practiceDirectory=Join-Path $systemDirectory 'runtime/boot-practice'
New-Item -ItemType Directory -Force $practiceDirectory | Out-Null
$image='mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902'
$container='cs-boot-practice';$network='cs-boot-practice-local'
$port=13318
function Invoke-Docker([string[]]$Arguments){$output=& $Docker @Arguments 2>&1 | Out-String;if($LASTEXITCODE -ne 0){throw 'Boot practice Docker operation failed; check the engine, image and local port.'};return $output.Trim()}
$found=& $Docker container inspect $container 2>$null
if($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath (Join-Path $systemDirectory 'runtime/local-compose/settings.env'))){
    & (Join-Path $PSScriptRoot 'local-compose.ps1') up -d boot-practice
    if($LASTEXITCODE -ne 0){throw 'Could not start the local Compose Boot practice service.'}
    $found=& $Docker container inspect $container 2>$null
    if($LASTEXITCODE -ne 0){throw 'Could not inspect the local Compose Boot practice service.'}
}
if($LASTEXITCODE -eq 0){
    $info=($found | ConvertFrom-Json)[0]
    $binding=$info.HostConfig.PortBindings.'3306/tcp'
    $isLocalCompose=$info.Config.Labels.'com.docker.compose.project' -eq 'codesomething-local' -and $info.Config.Labels.'com.docker.compose.service' -eq 'boot-practice'
    if($isLocalCompose -and $binding.HostPort -match '^\d{1,5}$'){$port=[int]$binding.HostPort}
    if($info.Config.Labels.'codesomething.boot-practice' -ne '1' -or $info.Config.Image -ne $image -or $binding.HostIp -ne '127.0.0.1' -or $port -lt 1 -or $port -gt 65535 -or $binding.HostPort -ne [string]$port){throw 'Existing container does not match the owned practice configuration.'}
    Invoke-Docker @('start',$container) | Out-Null
}else{
    $found=& $Docker network inspect $network 2>$null
    if($LASTEXITCODE -eq 0){$info=($found | ConvertFrom-Json)[0];if($info.Internal -or $info.Labels.'codesomething.boot-practice' -ne '1'){throw 'Existing network does not match the owned internal network.'}}
    else{Invoke-Docker @('network','create','--label=codesomething.boot-practice=1',$network) | Out-Null}
    Invoke-Docker @('run','-d','--pull=never','--name',$container,'--label=codesomething.boot-practice=1','--network',$network,'--publish','127.0.0.1:13318:3306','--memory=640m','--memory-swap=640m','--cpus=1','--pids-limit=256','--mount','type=volume,source=cs-boot-practice-data,target=/var/lib/mysql','--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes','--env=MYSQL_ROOT_HOST=localhost',$image,'--local-infile=0','--performance-schema=OFF','--innodb-buffer-pool-size=64M') | Out-Null
}
$ready=$false
for($attempt=0;$attempt -lt 100;$attempt++){
    $comm=& $Docker exec $container cat /proc/1/comm 2>$null
    if($LASTEXITCODE -eq 0 -and ($comm | Out-String).Trim() -eq 'mysqld'){
        & $Docker exec $container mysql -uroot --protocol=socket -e 'SELECT 1;' *> $null
        if($LASTEXITCODE -eq 0){$ready=$true;break}
    }
    Start-Sleep -Milliseconds 300
}
if(-not $ready){throw 'Practice MySQL did not become ready.'}
$configPath=Join-Path $practiceDirectory 'config.json'
$password=if(Test-Path -LiteralPath $configPath){(Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).password}else{[guid]::NewGuid().ToString('N')}
if($password -notmatch '^[a-f0-9]{32}$'){throw 'Invalid local practice credential format.'}
$sql="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE IF NOT EXISTS cs_lab CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'learner'@'%' IDENTIFIED BY '$password'; ALTER USER 'learner'@'%' IDENTIFIED BY '$password'; GRANT SELECT,INSERT,UPDATE,DELETE ON cs_lab.* TO 'learner'@'%'; USE cs_lab; CREATE TABLE IF NOT EXISTS tasks(id BIGINT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(100) NOT NULL,completed BOOLEAN NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS bookmarks(id BIGINT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(100) NOT NULL,saved BOOLEAN NOT NULL DEFAULT 0);"
Invoke-Docker @('exec',$container,'mysql','-uroot','--protocol=socket','-e',$sql) | Out-Null
if(-not (Test-Path -LiteralPath $configPath)){
    Invoke-Docker @('exec',$container,'mysql','-uroot','--default-character-set=utf8mb4','-e',"USE cs_lab; INSERT INTO tasks VALUES(1,'学习 HTTP',0),(2,'复习 SQL',1),(3,'练习 JDBC',0),(4,'阅读 Java',1),(5,'完成项目',0); INSERT INTO bookmarks VALUES(1,'Java文档',0),(2,'SQL手册',1),(3,'接口笔记',0),(4,'开发指南',1),(5,'数据库指南',0);") | Out-Null
}
[ordered]@{url="jdbc:mysql://127.0.0.1:${port}/cs_lab?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8";username='learner';password=$password;systemDirectory=$systemDirectory} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-boot-practice.ps1') -Destination (Join-Path $practiceDirectory 'run.ps1')
Write-Output "Boot practice MySQL ready at 127.0.0.1:${port}/cs_lab. Existing practice records were preserved."
Write-Output 'Use runtime/boot-practice/run.ps1 -ProjectDirectory <absolute-project-path> to run your application. Credentials remain in the local runtime directory.'
