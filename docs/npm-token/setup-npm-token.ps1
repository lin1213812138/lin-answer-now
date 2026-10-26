# =====================================================================
#  setup-npm-token.ps1
#  在新电脑上配置 npm Automation Token，彻底跳过 2FA / Security key 页面
#
#  用法（任选一种）：
#    1. 右键此文件 -> "使用 PowerShell 运行"
#    2. powershell -ExecutionPolicy Bypass -File .\setup-npm-token.ps1
#    3. 已有环境变量时免交互： $env:NPM_TOKEN="npm_xxx"; .\setup-npm-token.ps1
#
#  它做了什么：
#    - 从 %NPM_TOKEN% 或手动输入读取 token
#    - 备份现有 .npmrc 为 .npmrc.bak
#    - 写入 //registry.npmjs.org/:_authToken=npm_xxx（替换旧的同 registry 凭证）
#    - 用 npm whoami 验证是否生效
# =====================================================================

$ErrorActionPreference = 'Stop'

$registry = 'https://registry.npmjs.org/'
$keyName  = '//registry.npmjs.org/:_authToken'
$npmrc    = Join-Path $env:USERPROFILE '.npmrc'

Write-Host ''
Write-Host '=== npm token 配置 ===' -ForegroundColor Cyan
Write-Host "目标文件: $npmrc"

# ---------- 1. 取 token ----------
$token = $env:NPM_TOKEN

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ''
    Write-Host '请粘贴 npm Automation Token（npm_ 开头，输入时屏幕不显示）' -ForegroundColor Yellow
    $secure = Read-Host -AsSecureString 'Token'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$token = ($token -replace '\s', '').Trim()

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host '没有拿到 token，已退出。' -ForegroundColor Red
    exit 1
}

if ($token -notlike 'npm_*') {
    Write-Warning 'token 不以 npm_ 开头，仍继续写入，但请确认来源正确。'
}

# ---------- 2. 备份并写入 ----------
$lines = @()
if (Test-Path $npmrc) {
    Copy-Item -Path $npmrc -Destination ($npmrc + '.bak') -Force
    Write-Host "已备份旧配置 -> $npmrc.bak" -ForegroundColor DarkGray
    $lines = @(Get-Content -Path $npmrc)
}

$kept = @()
foreach ($line in $lines) {
    if ($line -notlike "*$keyName*") {
        $kept += $line
    }
}

$hasRegistry = $false
foreach ($line in $kept) {
    if ($line -like 'registry=*' -or $line -like 'registry =*') {
        $hasRegistry = $true
    }
}
if (-not $hasRegistry) {
    $kept += "registry=$registry"
}

$kept += "$keyName=$token"

Set-Content -Path $npmrc -Value $kept -Encoding utf8
Write-Host "已写入 $keyName" -ForegroundColor Green

# ---------- 3. 验证 ----------
Write-Host ''
Write-Host '=== 验证 ===' -ForegroundColor Cyan

$who = & npm whoami --registry $registry 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "登录成功，当前用户: $who" -ForegroundColor Green
} else {
    Write-Host $who -ForegroundColor Red
    Write-Host '验证失败：token 可能已失效/被撤销，或该 token 无权访问此 registry。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '完成。之后 npm install / npm publish 都不会再弹 2FA。' -ForegroundColor Cyan
Write-Host '撤销方式：npmjs.com -> Access Tokens -> 删除该 token；或删掉 .npmrc 里那行 _authToken。' -ForegroundColor DarkGray
