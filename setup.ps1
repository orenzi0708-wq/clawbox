# ClawBox Bootstrap Script for Windows
# Usage: powershell -c "irm https://raw.githubusercontent.com/<repo>/main/setup.ps1 | iex"
#    or: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔═══════════════════════════════════╗"
Write-Host "  ║     📦 ClawBox Bootstrap          ║"
Write-Host "  ║   环境检测 & 依赖安装              ║"
Write-Host "  ╚═══════════════════════════════════╝"
Write-Host ""

# ========== 检查 Windows 版本 ==========
Write-Host "✓ Windows $($PSVersionTable.OS) " -ForegroundColor Green

# ========== 检查管理员权限 ==========
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-Host "✓ 运行模式: 管理员" -ForegroundColor Green
} else {
    Write-Host "! 运行模式: 非管理员（部分操作可能需要管理员权限）" -ForegroundColor Yellow
}

# ========== 检查/安装 Node.js ==========
function Install-Node {
    Write-Host "正在安装 Node.js..." -ForegroundColor Cyan

    # 方法1: winget (Windows 10 1809+)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  使用 winget 安装 Node.js 22..." -ForegroundColor Gray
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        # 刷新 PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return
    }

    # 方法2: Chocolatey
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "  使用 Chocolatey 安装 Node.js 22..." -ForegroundColor Gray
        choco install nodejs-lts -y
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return
    }

    # 方法3: Scoop
    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        Write-Host "  使用 Scoop 安装 Node.js 22..." -ForegroundColor Gray
        scoop install nodejs-lts
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return
    }

    # 方法4: 直接下载官方 msi
    Write-Host "  未找到包管理器，直接下载 Node.js 安装包..." -ForegroundColor Gray
    $msiUrl = "https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi"
    $msiPath = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Wait
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node -v
    $nodeMajor = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -ge 22) {
        Write-Host "✓ Node.js $nodeVer 已安装" -ForegroundColor Green
        $nodeOk = $true
    } else {
        Write-Host "! Node.js $nodeVer 版本过低，需要 >= 22" -ForegroundColor Yellow
    }
} else {
    Write-Host "! Node.js 未安装" -ForegroundColor Yellow
}

if (-not $nodeOk) {
    Install-Node
    # 验证
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Host "✓ Node.js $(node -v) 安装完成" -ForegroundColor Green
    } else {
        Write-Host "✗ Node.js 安装失败，请手动安装: https://nodejs.org" -ForegroundColor Red
        exit 1
    }
}

# ========== 初始化 OpenClaw 配置 ==========
if (Get-Command openclaw -ErrorAction SilentlyContinue) {
    Write-Host "初始化 OpenClaw 配置..." -ForegroundColor Gray
    openclaw config set gateway.mode local 2>$null
    openclaw config set gateway.auth.mode none 2>$null
    Write-Host "✓ OpenClaw 配置完成" -ForegroundColor Green
}

# ========== 安装 ClawHub CLI ==========
$clawhubOk = $false
if (Get-Command clawhub -ErrorAction SilentlyContinue) {
    Write-Host "✓ ClawHub CLI 已安装" -ForegroundColor Green
    $clawhubOk = $true
} else {
    Write-Host "正在安装 ClawHub CLI..." -ForegroundColor Gray
    try {
        npm --loglevel error --no-fund --no-audit install -g clawhub 2>$null
        Write-Host "✓ ClawHub CLI 安装完成" -ForegroundColor Green
        $clawhubOk = $true
    } catch {
        Write-Host "! ClawHub 安装失败，Skills 市场将不可用" -ForegroundColor Yellow
    }
}

# ========== 安装 ClawBox 依赖 ==========
$clawboxDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$clawboxDir\package.json") {
    Write-Host "正在安装 ClawBox 依赖..." -ForegroundColor Gray
    Set-Location $clawboxDir
    npm install --registry https://registry.npmjs.org/
    Write-Host "✓ ClawBox 依赖安装完成" -ForegroundColor Green
}

# ========== 完成 ==========
Write-Host ""
Write-Host "  ╔═══════════════════════════════════╗"
Write-Host "  ║     ✅ 环境准备就绪                ║"
Write-Host "  ╚═══════════════════════════════════╝"
Write-Host ""
Write-Host "  启动 ClawBox:"
Write-Host "    cd $clawboxDir && node src\server.js"
Write-Host ""
Write-Host "  然后在浏览器打开: http://localhost:3456"
Write-Host ""
