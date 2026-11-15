# Paldex: sobe/derruba tudo com um comando.
#   .\run.ps1            instala dependências (se faltar) e inicia API + frontend via pm2
#   .\run.ps1 -Dev       sem pm2: API em background nesta janela + Vite em primeiro plano
#   .\run.ps1 -Stop      para os processos do pm2
#   .\run.ps1 -Logs      acompanha os logs
#   .\run.ps1 -Status    mostra o estado dos processos
param(
    [switch]$Dev,
    [switch]$Stop,
    [switch]$Logs,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Need($cmd, $hint) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "'$cmd' não encontrado. $hint" }
}

if ($Stop)   { Need pm2 'npm i -g pm2'; pm2 delete ecosystem.config.js; exit }
if ($Logs)   { Need pm2 'npm i -g pm2'; pm2 logs; exit }
if ($Status) { Need pm2 'npm i -g pm2'; pm2 status; exit }

Need python 'Instale o Python 3.10+.'
Need npm 'Instale o Node.js 18+.'

# Dependências: só instala se faltar.
python -c "import flask, palworld_save_tools, ooz" 2>$null
if ($LASTEXITCODE -ne 0) { python -m pip install -r requirements.txt }
if (-not (Test-Path node_modules)) { npm install }

if ($Dev) {
    $api = Start-Process python -ArgumentList 'server.py' -NoNewWindow -PassThru
    try { npm run dev } finally { Stop-Process -Id $api.Id -ErrorAction SilentlyContinue }
    exit
}

Need pm2 'npm i -g pm2   (ou use .\run.ps1 -Dev)'
pm2 start ecosystem.config.js
Write-Host "`nPaldex: http://localhost:5173   (logs: .\run.ps1 -Logs | parar: .\run.ps1 -Stop)"
