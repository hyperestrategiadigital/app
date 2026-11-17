# Publica o Hyper App no Firebase (Windows).
# Uso (Win+R ou PowerShell):
#   powershell -NoExit -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/hyperestrategiadigital/app/main/publicar.ps1 | iex"

function Publicar-HyperApp {
  $ErrorActionPreference = 'Stop'
  $pasta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'hyper-app'

  Write-Host "`n=== Publicar Hyper App no Firebase ===`n" -ForegroundColor Cyan

  Write-Host "[1/4] Baixando o app do GitHub para $pasta ..."
  $zip = Join-Path $env:TEMP 'hyper-app.zip'
  $tmp = Join-Path $env:TEMP 'hyper-app-extraido'
  Invoke-WebRequest 'https://github.com/hyperestrategiadigital/app/archive/refs/heads/main.zip' -OutFile $zip -UseBasicParsing
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  Copy-Item (Join-Path $tmp 'app-main\*') $pasta -Recurse -Force
  Remove-Item $zip, $tmp -Recurse -Force

  Write-Host "`n[2/4] Verificando o Node.js ..."
  $env:Path += ";$env:ProgramFiles\nodejs"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado. Instalando (pode pedir permissao de administrador)..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ";$env:ProgramFiles\nodejs"
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Nao consegui instalar o Node.js. Instale a versao LTS em https://nodejs.org e rode de novo." -ForegroundColor Red
    return
  }
  node --version

  Set-Location $pasta
  Write-Host "`n[3/4] Login no Firebase: o navegador vai abrir. Entre com a conta Google do projeto." -ForegroundColor Yellow
  npx.cmd -y firebase-tools@latest login
  if ($LASTEXITCODE -ne 0) { Write-Host "Falha no login. Mande a mensagem acima para o Claude." -ForegroundColor Red; return }

  Write-Host "`n[4/4] Publicando site, regras e indices..."
  npx.cmd -y firebase-tools@latest deploy --project hyper-9e023
  if ($LASTEXITCODE -ne 0) { Write-Host "Falha no deploy. Mande a mensagem acima para o Claude." -ForegroundColor Red; return }

  Write-Host "`nPRONTO! Seu site esta em https://hyper-9e023.web.app`n" -ForegroundColor Green
  Start-Process 'https://hyper-9e023.web.app'
}

try { Publicar-HyperApp } catch { Write-Host "`nErro: $($_.Exception.Message)`nMande esta mensagem para o Claude." -ForegroundColor Red }
