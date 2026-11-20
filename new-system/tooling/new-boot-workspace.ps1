param([string]$Destination,[ValidateSet('boot-foundations','task-manager','collaboration')][string]$Course,[string]$Stage)
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$starter=Join-Path $systemDirectory 'runner/boot/starter'
if($Course){
    $stages=if($Course -eq 'boot-foundations'){@('boot-start','boot-http','boot-layers','boot-jdbc')}elseif($Course -eq 'collaboration'){@('b-login','b-roles','b-plans','b-pagination','b-transaction','b-errors-logs','b-tests','b-deploy')}else{@('a-read','a-create','a-update-delete','a-validation','a-pagination','a-transfer')}
    if($Stage -notin $stages){throw 'Choose a published stage of the selected course.'}
    $starter=Join-Path $systemDirectory "course-packs/$Course/1.0.0/$Stage/starter"
}
if(-not $Destination){$Destination=Join-Path $systemDirectory $(if($Course){"runtime/workspaces/$Stage"}else{'runtime/boot-workspace'})}
if(-not [IO.Path]::IsPathRooted($Destination)){$Destination=Join-Path (Get-Location) $Destination}
$Destination=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $Destination){throw "Destination already exists; choose an unused directory: $Destination"}
New-Item -ItemType Directory -Path $Destination | Out-Null
Get-ChildItem -LiteralPath $starter | Copy-Item -Destination $Destination -Recurse
if(-not $Course){Copy-Item -LiteralPath (Join-Path $systemDirectory 'backend/src/main/resources/runner/boot/pom.xml') -Destination (Join-Path $Destination 'pom.xml')}
Write-Output "Open in IDEA: $Destination"
Write-Output 'Run dev.codesomething.lab.Application; GET http://127.0.0.1:8080/api/health returns {"status":"ok"}.'
