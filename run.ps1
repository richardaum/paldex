# Paldex: avalia pré-requisitos, instala dependências, sobe tudo e reporta o que falhou.
#   .\run.ps1            avalia, instala o que faltar e inicia API + frontend via pm2
#   .\run.ps1 -Check     só avalia os pré-requisitos do sistema (não instala nem inicia nada)
#   .\run.ps1 -Dev       sem pm2: API em background + Vite em primeiro plano (Ctrl+C encerra)
#   .\run.ps1 -Stop      para os processos do pm2
#   .\run.ps1 -Logs      acompanha os logs
#   .\run.ps1 -Status    mostra o estado dos processos
param(
    [switch]$Check,
    [switch]$Dev,
    [switch]$Stop,
    [switch]$Logs,
    [switch]$Status
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$LogDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force $LogDir | Out-Null

# ---------- utilidades ----------
$script:Report = New-Object System.Collections.ArrayList
function Add-Result($Level, $Name, $Detail, $Fix) {
    [void]$script:Report.Add([pscustomobject]@{ Level = $Level; Name = $Name; Detail = $Detail; Fix = $Fix })
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# Roda uma linha de comando via cmd (stderr de pip/npm não vira exceção), grava o log e devolve o código de saída.
function Invoke-Logged($Name, $CmdLine) {
    $log = Join-Path $LogDir ("install-" + ($Name -replace '[^\w]+', '-') + ".log")
    cmd /c "$CmdLine > `"$log`" 2>&1"
    return [pscustomobject]@{ Code = $LASTEXITCODE; Log = $log }
}
function Log-Tail($Path, $N = 6) {
    if (Test-Path $Path) { return ((Get-Content $Path -Tail $N) -join "`n    ") }
    return ''
}
function Get-Version($cmd, $args_) {
    try {
        $out = (& $cmd $args_ 2>&1 | Out-String)
        if ($out -match '(\d+)\.(\d+)(?:\.(\d+))?') { return [version]("$($Matches[1]).$($Matches[2])") }
    } catch {}
    return $null
}
function Pm2Online($name) {
    if (-not (Has pm2)) { return $false }
    $id = (pm2 pid $name 2>$null | Out-String).Trim()
    return ($id -match '^\d+$' -and [int]$id -gt 0)
}

# ---------- comandos simples ----------
if ($Stop)   { if (Has pm2) { pm2 delete ecosystem.config.js } else { Write-Host "pm2 não encontrado." }; exit }
if ($Logs)   { if (Has pm2) { pm2 logs } else { Write-Host "pm2 não encontrado." }; exit }
if ($Status) { if (Has pm2) { pm2 status } else { Write-Host "pm2 não encontrado." }; exit }

# ---------- 1. avaliação de pré-requisitos ----------
Write-Host "`n== Avaliando pré-requisitos ==" -ForegroundColor Cyan

$os = [Environment]::OSVersion.Version
if ($os.Major -ge 10) { Add-Result OK 'Sistema' "Windows $($os.Major).$($os.Minor) build $($os.Build)" }
else { Add-Result WARN 'Sistema' "Windows $os (testado só no 10/11)" }

if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64' -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { Add-Result OK 'Arquitetura' $env:PROCESSOR_ARCHITECTURE }
else { Add-Result WARN 'Arquitetura' "$($env:PROCESSOR_ARCHITECTURE): pyooz (descompressão do save) pode não ter pacote pronto" }

# Python 3.10+
if (Has python) {
    $pv = Get-Version python '--version'
    if ($pv -and $pv -ge [version]'3.10') { Add-Result OK 'Python' "$pv" }
    else { Add-Result FAIL 'Python' "versão $pv (precisa 3.10+)" 'Instale o Python 3.10+ em https://www.python.org/downloads/ (marque "Add to PATH").' }
    $null = python -m pip --version 2>&1
    if ($LASTEXITCODE -eq 0) { Add-Result OK 'pip' 'disponível' } else { Add-Result FAIL 'pip' 'python -m pip não funciona' 'Rode: python -m ensurepip --upgrade' }
} else {
    Add-Result FAIL 'Python' 'não encontrado no PATH' 'Instale o Python 3.10+ em https://www.python.org/downloads/ (marque "Add to PATH").'
}

# Node 18+ / npm
if (Has node) {
    $nv = Get-Version node '--version'
    if ($nv -and $nv -ge [version]'18.0') { Add-Result OK 'Node.js' "$nv" }
    else { Add-Result FAIL 'Node.js' "versão $nv (precisa 18+)" 'Instale o Node.js LTS em https://nodejs.org/' }
} else {
    Add-Result FAIL 'Node.js' 'não encontrado no PATH' 'Instale o Node.js LTS em https://nodejs.org/'
}
if (Has npm) { Add-Result OK 'npm' 'disponível' } else { Add-Result FAIL 'npm' 'não encontrado' 'Vem com o Node.js: https://nodejs.org/' }

# pm2 (opcional; será instalado se faltar, exceto com -Dev/-Check)
if (Has pm2) { Add-Result OK 'pm2' 'disponível' }
else { Add-Result WARN 'pm2' 'não encontrado (opcional)' 'Será instalado com "npm i -g pm2"; ou use .\run.ps1 -Dev.' }

# Disco e memória
try {
    $drive = Get-PSDrive -Name ($PSScriptRoot.Substring(0, 1)) -ErrorAction Stop
    $freeMb = [math]::Round($drive.Free / 1MB)
    if ($freeMb -ge 500) { Add-Result OK 'Disco livre' "$freeMb MB" } else { Add-Result WARN 'Disco livre' "$freeMb MB (recomendado 500+ MB para node_modules)" }
} catch {}
try {
    $freeRam = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
    if ($freeRam -ge 500) { Add-Result OK 'Memória livre' "$freeRam MB" } else { Add-Result WARN 'Memória livre' "$freeRam MB (ler o save usa algumas centenas de MB)" }
} catch {}

# Portas 5000 (API) e 5173 (UI, strictPort)
foreach ($p in @(@{Port = 5000; App = 'paldex'}, @{Port = 5173; App = 'paldex-vite'})) {
    $conn = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { Add-Result OK "Porta $($p.Port)" 'livre' }
    elseif (Pm2Online $p.App) { Add-Result OK "Porta $($p.Port)" "em uso pelo próprio Paldex ($($p.App) já está rodando)" }
    else {
        $proc = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Add-Result FAIL "Porta $($p.Port)" "ocupada por '$proc' (PID $($conn.OwningProcess))" "Encerre esse processo (Stop-Process -Id $($conn.OwningProcess)) — o Paldex precisa dessa porta."
    }
}

# Save do Palworld (só leitura)
$saveRoot = if ($env:PALDEX_SAVE_DIR) { $env:PALDEX_SAVE_DIR } else { Join-Path $env:LOCALAPPDATA 'Pal\Saved\SaveGames' }
$saves = @()
if (Test-Path $saveRoot) { $saves = @(Get-ChildItem $saveRoot -Recurse -Filter Level.sav -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\backup\\' }) }
if ($saves.Count -gt 0) { Add-Result OK 'Save do Palworld' "$($saves.Count) mundo(s) em $saveRoot" }
else { Add-Result WARN 'Save do Palworld' "nenhum Level.sav em $saveRoot" 'Abra o jogo ao menos uma vez, ou aponte a pasta com $env:PALDEX_SAVE_DIR. O app abre, mas sem Pals.' }

# Internet (ícones vêm do CDN do paldb.cc)
try {
    $null = Invoke-WebRequest -Uri 'https://cdn.paldb.cc/' -Method Head -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Add-Result OK 'Internet (ícones)' 'cdn.paldb.cc acessível'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { Add-Result OK 'Internet (ícones)' "cdn.paldb.cc respondeu ($code)" }
    else { Add-Result WARN 'Internet (ícones)' 'cdn.paldb.cc inacessível' 'O app funciona, mas os ícones de Pals/aptidões não aparecem. Também necessária para pip/npm install.' }
}

function Show-Report {
    Write-Host ''
    foreach ($r in $script:Report) {
        $color = @{ OK = 'Green'; WARN = 'Yellow'; FAIL = 'Red' }[$r.Level]
        $tag = @{ OK = ' OK '; WARN = 'WARN'; FAIL = 'FAIL' }[$r.Level]
        Write-Host ("[{0}] {1,-18} {2}" -f $tag, $r.Name, $r.Detail) -ForegroundColor $color
        if ($r.Level -ne 'OK' -and $r.Fix) { Write-Host ("       -> {0}" -f $r.Fix) -ForegroundColor DarkGray }
    }
    $f = @($script:Report | Where-Object Level -eq 'FAIL').Count
    $w = @($script:Report | Where-Object Level -eq 'WARN').Count
    Write-Host ("`nResumo: {0} falha(s), {1} aviso(s)." -f $f, $w) -ForegroundColor $(if ($f) { 'Red' } elseif ($w) { 'Yellow' } else { 'Green' })
    return $f
}

if ($Check) { $fails = Show-Report; exit ([int]($fails -gt 0)) }

# Falha de pré-requisito bloqueante: não adianta instalar.
$blocking = @($script:Report | Where-Object { $_.Level -eq 'FAIL' -and $_.Name -in @('Python', 'pip', 'Node.js', 'npm') })
if ($blocking.Count) { $null = Show-Report; Write-Host "`nCorrija os itens FAIL acima e rode de novo." -ForegroundColor Red; exit 1 }

# ---------- 2. instalação ----------
Write-Host "`n== Instalando dependências ==" -ForegroundColor Cyan

python -c "import flask, palworld_save_tools, ooz" 2>$null
if ($LASTEXITCODE -eq 0) { Add-Result OK 'Dependências Python' 'já instaladas' }
else {
    Write-Host 'pip install -r requirements.txt ...'
    $r = Invoke-Logged 'pip' 'python -m pip install -r requirements.txt'
    if ($r.Code -eq 0) { Add-Result OK 'Dependências Python' 'instaladas (flask, palworld-save-tools, pyooz)' }
    else { Add-Result FAIL 'Dependências Python' "pip install falhou (código $($r.Code))`n    $(Log-Tail $r.Log)" "Veja o log completo: $($r.Log)" }
}

if (Test-Path (Join-Path $PSScriptRoot 'node_modules\vite')) { Add-Result OK 'Dependências Node' 'já instaladas' }
else {
    Write-Host 'npm install ...'
    $r = Invoke-Logged 'npm' 'npm install'
    if ($r.Code -eq 0) { Add-Result OK 'Dependências Node' 'instaladas (vite)' }
    else { Add-Result FAIL 'Dependências Node' "npm install falhou (código $($r.Code))`n    $(Log-Tail $r.Log)" "Veja o log completo: $($r.Log)" }
}

if (-not $Dev -and -not (Has pm2)) {
    Write-Host 'npm i -g pm2 ...'
    $r = Invoke-Logged 'pm2' 'npm install -g pm2'
    if ($r.Code -eq 0 -and (Has pm2)) { Add-Result OK 'pm2' 'instalado' }
    else { Add-Result FAIL 'pm2' "instalação falhou (código $($r.Code))`n    $(Log-Tail $r.Log)" "Tente como administrador, ou use .\run.ps1 -Dev. Log: $($r.Log)" }
}

$installFail = @($script:Report | Where-Object { $_.Level -eq 'FAIL' -and $_.Name -match 'Dependências|^pm2$' }).Count
if ($installFail) { $null = Show-Report; Write-Host "`nA instalação falhou; nada foi iniciado." -ForegroundColor Red; exit 1 }

# ---------- 3. execução ----------
if ($Dev) {
    $null = Show-Report
    Write-Host "`nIniciando em modo dev: http://localhost:5173 (Ctrl+C encerra)" -ForegroundColor Cyan
    $api = Start-Process python -ArgumentList 'server.py' -NoNewWindow -PassThru
    try { npm run dev } finally { Stop-Process -Id $api.Id -ErrorAction SilentlyContinue }
    exit
}

Write-Host "`n== Iniciando ==" -ForegroundColor Cyan
pm2 start ecosystem.config.js | Out-Null

# Confere que realmente subiu.
$ok = @{ api = $false; ui = $false }
for ($i = 0; $i -lt 60 -and -not ($ok.api -and $ok.ui); $i++) {
    Start-Sleep -Seconds 1
    foreach ($t in @(@{k = 'api'; u = 'http://localhost:5000/api/status'}, @{k = 'ui'; u = 'http://localhost:5173/'})) {
        if (-not $ok[$t.k]) { try { $ok[$t.k] = ((Invoke-WebRequest $t.u -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) } catch {} }
    }
}
if ($ok.api) { Add-Result OK 'API (5000)' 'respondendo' } else { Add-Result FAIL 'API (5000)' 'não respondeu em 60s' 'Veja: .\run.ps1 -Logs  (ou data\pm2-err.log)' }
if ($ok.ui)  { Add-Result OK 'Frontend (5173)' 'respondendo' } else { Add-Result FAIL 'Frontend (5173)' 'não respondeu em 60s' 'Veja: .\run.ps1 -Logs  (ou data\pm2-vite-err.log)' }

$fails = Show-Report
if ($fails -eq 0) { Write-Host "`nPaldex: http://localhost:5173   (logs: .\run.ps1 -Logs | parar: .\run.ps1 -Stop)" -ForegroundColor Green }
exit ([int]($fails -gt 0))
