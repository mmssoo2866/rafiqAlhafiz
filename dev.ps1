# ================================================================
# dev.ps1 — سكريبت تشغيل رفيق الحافظ محلياً على Windows
# ================================================================
# الاستخدام: .\dev.ps1
# يُشغّل خادم API على المنفذ 3001 وواجهة Vite على المنفذ 5173
# ================================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   رفيق الحافظ — وضع التطوير المحلي" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. التحقق من وجود pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "[!] pnpm غير مثبت. جاري التثبيت..." -ForegroundColor Yellow
    npm install -g pnpm
}

# 2. تثبيت الحزم
Write-Host "[1/3] جاري تثبيت الحزم (pnpm install)..." -ForegroundColor Green
Set-Location $ROOT
pnpm install

# 3. بناء خادم API
Write-Host ""
Write-Host "[2/3] جاري بناء خادم API..." -ForegroundColor Green
Set-Location "$ROOT\artifacts\api-server"
$env:NODE_ENV = "development"
node ./build.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "فشل بناء خادم API!" -ForegroundColor Red
    exit 1
}

# 4. تشغيل الخادمين بالتوازي
Write-Host ""
Write-Host "[3/3] تشغيل الخادمين..." -ForegroundColor Green
Write-Host "   * API Server  -> http://localhost:3001" -ForegroundColor Yellow
Write-Host "   * Vite (UI)   -> http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "اضغط Ctrl+C لايقاف كلا الخادمين." -ForegroundColor DarkGray
Write-Host ""

# تشغيل خادم API في نافذة منفصلة
$apiProcess = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ROOT\artifacts\api-server'; `$env:PORT='3001'; `$env:NODE_ENV='development'; Write-Host '[API] الخادم يعمل على http://localhost:3001' -ForegroundColor Cyan; node --enable-source-maps ./dist/index.mjs"
) -PassThru

# تشغيل Vite في هذه النافذة
Set-Location "$ROOT\artifacts\rafiq-alhafiz"
$env:PORT = "5173"
$env:BASE_PATH = "/"
$env:API_PORT = "3001"

try {
    pnpm vite --config vite.config.ts --host 0.0.0.0 --port 5173
}
finally {
    Write-Host ""
    Write-Host "جاري ايقاف خادم API..." -ForegroundColor DarkGray
    if ($apiProcess -and -not $apiProcess.HasExited) {
        $apiProcess.Kill()
    }
    Write-Host "تم الايقاف." -ForegroundColor Green
}
