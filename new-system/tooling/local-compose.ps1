$projectRoot = Split-Path $PSScriptRoot -Parent
$deployment = Join-Path $projectRoot 'deployment'
$settings = Join-Path $projectRoot 'runtime/local-compose/settings.env'

if (-not (Test-Path -LiteralPath $settings -PathType Leaf)) {
    throw 'Missing local Compose settings. See new-system/README.md.'
}

docker --context desktop-linux compose --env-file $settings `
    -p codesomething-local `
    -f (Join-Path $deployment 'docker-compose.prod.yml') `
    -f (Join-Path $deployment 'docker-compose.local.yml') @args
exit $LASTEXITCODE
