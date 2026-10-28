#requires -Version 5.1
<#
.SYNOPSIS
  Prepara VentasCatálogo en Windows de punta a punta: dependencias, secretos,
  infraestructura Docker, migraciones y seed.

.DESCRIPTION
  Es idempotente. Si `.env` ya existe no lo sobreescribe; sólo reemplaza los
  placeholders de secretos si siguen presentes. Requiere Node 22+, Corepack,
  Docker Desktop y pnpm 9.15.4 (se activa con Corepack si falta).
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step([string] $message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor DarkGreen
}

function Assert-Command([string] $name, [string] $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Falta '$name'. $hint"
  }
}

function New-Base64Secret([int] $bytes) {
  $buffer = New-Object byte[] $bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($buffer)
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Arguments)
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @Arguments
  } else {
    & corepack pnpm @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($Arguments -join ' ') falló con código $LASTEXITCODE."
  }
}

Write-Step 'Verificando herramientas'
Assert-Command node 'Instalá Node.js 22 LTS desde https://nodejs.org.'
Assert-Command docker 'Instalá Docker Desktop y asegurate de que el daemon esté corriendo.'

$nodeVersion = (node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) {
  throw "Node $nodeVersion no es suficiente. Este proyecto pide Node >= 22 (ideal 22 LTS)."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'pnpm no está en PATH; activando 9.15.4 con Corepack…'
  corepack prepare pnpm@9.15.4 --activate
  corepack enable pnpm
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'No se pudo crear el shim de pnpm; se usará `corepack pnpm`.' -ForegroundColor Yellow
}
Write-Host "Node $nodeVersion · pnpm $(if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm --version } else { corepack pnpm --version })"

Write-Step 'Preparando variables de entorno'
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Creado .env desde .env.example.'
}
if (-not (Test-Path '.env.seed')) {
  Copy-Item '.env.seed.example' '.env.seed'
  Write-Host 'Creado .env.seed con las cuentas demo.'
}

$envPath = Join-Path $root '.env'
$envText = [System.IO.File]::ReadAllText($envPath)
if ($envText -match '(?m)^JWT_ACCESS_SECRET=CAMBIA_ESTO') {
  $envText = $envText -replace '(?m)^JWT_ACCESS_SECRET=.*$', "JWT_ACCESS_SECRET=$(New-Base64Secret 48)"
}
if ($envText -match '(?m)^JWT_REFRESH_SECRET=CAMBIA_ESTO') {
  $envText = $envText -replace '(?m)^JWT_REFRESH_SECRET=.*$', "JWT_REFRESH_SECRET=$(New-Base64Secret 48)"
}
if ($envText -match '(?m)^ENCRYPTION_KEY=CAMBIA_ESTO') {
  $envText = $envText -replace '(?m)^ENCRYPTION_KEY=.*$', "ENCRYPTION_KEY=$(New-Base64Secret 32)"
}
[System.IO.File]::WriteAllText($envPath, $envText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Secretos locales listos (no se versionan).'

Write-Step 'Instalando dependencias'
Invoke-Pnpm install

Write-Step 'Levantando infraestructura (Postgres, Redis, MinIO, Mailpit)'
Invoke-Pnpm infra:up

Write-Step 'Esperando a PostgreSQL'
$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
  $health = docker inspect --format '{{.State.Health.Status}}' vc-postgres 2>$null
  if ($health -eq 'healthy') {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  throw 'PostgreSQL no quedó healthy. Revisá `docker compose logs postgres`.'
}

Write-Step 'Aplicando migraciones'
$migrations = Get-ChildItem 'apps/api/prisma/migrations' -Directory -ErrorAction SilentlyContinue
if ($migrations) {
  Invoke-Pnpm db:deploy
} else {
  Invoke-Pnpm db:migrate -- --name init_identity_and_users
}

Write-Step 'Sembrando roles, usuarios y catálogo demo'
Invoke-Pnpm db:seed

Write-Host ""
Write-Host 'Listo. Abrí estas URLs:' -ForegroundColor Green
Write-Host '  Backoffice  http://app.localhost:3000/login'
Write-Host '  Tienda      http://tienda.localhost:3000/tienda'
Write-Host '  Portal      http://tienda.localhost:3000/mi-cuenta/entrar'
Write-Host '  Mailpit     http://localhost:8025'
Write-Host '  API docs    http://localhost:3001/api/docs'
Write-Host ''
Write-Host 'Cuentas demo: admin@ / cliente@ / mixto@ventascatalogo.local · Demo1234!'
Write-Host 'El admin debe enrolar TOTP en el primer login.'
Write-Host ''
Write-Host 'Arrancá el modo desarrollo con: pnpm dev'
