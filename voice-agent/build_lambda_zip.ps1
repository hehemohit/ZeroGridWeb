# build_lambda_zip.ps1
# Builds a 100% AWS Lambda Linux-compatible deployment zip using Docker
# Eliminates Windows C-extension wheel incompatibility errors (e.g. pydantic-core)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==> Checking Docker availability..." -ForegroundColor Cyan
try {
    $dockerVersion = docker --version
    Write-Host "Found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Error "Docker is required to package Linux x86_64 binaries for AWS Lambda on Windows."
    exit 1
}

$ZipName = "voice-agent-lambda.zip"
if (Test-Path $ZipName) {
    Remove-Item $ZipName -Force
}

Write-Host "==> Building Docker image for AWS Lambda Python 3.11..." -ForegroundColor Cyan
docker build -t voice-agent-builder -f Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed."
    exit 1
}

Write-Host "==> Extracting compiled Lambda package..." -ForegroundColor Cyan
$ContainerId = docker create voice-agent-builder
if (-not $ContainerId) {
    Write-Error "Failed to create temporary Docker container."
    exit 1
}

$TempExtractDir = Join-Path $ScriptDir "lambda_package_temp"
if (Test-Path $TempExtractDir) {
    Remove-Item $TempExtractDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempExtractDir | Out-Null

try {
    # Copy all files from Lambda task root
    docker cp "${ContainerId}:/var/task/." $TempExtractDir
    
    Write-Host "==> Compressing into $ZipName..." -ForegroundColor Cyan
    Compress-Archive -Path "$TempExtractDir\*" -DestinationPath (Join-Path $ScriptDir $ZipName) -Force
    
    $zipFileInfo = Get-Item (Join-Path $ScriptDir $ZipName)
    $sizeMb = [math]::Round($zipFileInfo.Length / 1MB, 2)
    Write-Host "==> [SUCCESS] Created $ZipName ($sizeMb MB) ready for upload to AWS Lambda!" -ForegroundColor Green
} finally {
    docker rm $ContainerId | Out-Null
    if (Test-Path $TempExtractDir) {
        Remove-Item $TempExtractDir -Recurse -Force
    }
}
