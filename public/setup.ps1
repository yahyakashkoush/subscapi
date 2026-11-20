# =====================================================================
# SubscAPI - One-Click Automatic IDE & Environment Configurator (Windows)
# Supports: Cursor, Windsurf, Cline, Roo Code, Qoder, OpenCode, VS Code, Global Env
# Base URL: https://ai.subsc.tech/v1
# =====================================================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-BrandHeader {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Cyan
    Write-Host "       ⚡ SubscAPI - Auto-Configurator for AI IDEs & Tools ⚡       " -ForegroundColor Yellow -NoNewline
    Write-Host ""
    Write-Host "      المثبت والمهيئ التلقائي لبرامج البرمجة بالذكاء الاصطناعي      " -ForegroundColor White
    Write-Host "===================================================================" -ForegroundColor Cyan
    Write-Host " Gateway Endpoint: https://ai.subsc.tech/v1" -ForegroundColor Gray
    Write-Host " Active Engine:    gpt-6.1-sol / gpt-4o (Ultra-fast streaming)" -ForegroundColor Gray
    Write-Host "===================================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-BrandHeader

# Step 1: Prompt for API Key
$subscKey = ""
while ([string]::IsNullOrWhiteSpace($subscKey)) {
    Write-Host "[?] ادخل مفتاح SubscAPI الخاص بك (Enter your API Key):" -ForegroundColor Green
    $subscKey = Read-Host "    (sk-subsc-...)"
    $subscKey = $subscKey.Trim()
    if ([string]::IsNullOrWhiteSpace($subscKey)) {
        Write-Host "[-] عذراً، لا يمكن ترك المفتاح فارغاً. حاول مرة أخرى." -ForegroundColor Red
    }
}

# Step 2: Live validation against SubscAPI Gateway
Write-Host ""
Write-Host "[*] جارٍ التحقق من المفتاح مع سيرفر SubscAPI المباشر..." -ForegroundColor Cyan

$keyValid = $false
$tierName = "Standard"
$remainingBal = 0

try {
    $verifyPayload = @{ clientKey = $subscKey } | ConvertTo-Json
    $verifyResp = Invoke-RestMethod -Uri "https://ai.subsc.tech/api/client/check-key" -Method POST -Body $verifyPayload -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop

    if ($verifyResp.success) {
        $keyValid = $true
        $tierName = $verifyResp.data.packageName
        $remainingBal = $verifyResp.remainingBalance
        Write-Host "[+] تم التحقق بنجاح!" -ForegroundColor Green
        Write-Host "    الباقة: $tierName | الرصيد المتبقي: `$$remainingBal | الحالة: نشط" -ForegroundColor Green
    } else {
        Write-Host "[!] المفتاح غير مسجل، سيتم المتابعة وإعداده على جهازك." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[!] تعذر التحقق السريع من السيرفر، سيتم المتابعة وإعداد الملفات." -ForegroundColor Yellow
}

# Step 3: Interactive Menu Selection
Write-Host ""
Write-Host "اختر البرنامج الذي ترغب في تهيئته تلقائياً (Select Target):" -ForegroundColor Cyan
Write-Host "  [1] Cursor (AppData\Roaming\Cursor)" -ForegroundColor White
Write-Host "  [2] Cline (VS Code Extension - Config & Provider Settings)" -ForegroundColor White
Write-Host "  [3] Roo Code (VS Code Extension)" -ForegroundColor White
Write-Host "  [4] Windsurf (AppData\Roaming\Windsurf)" -ForegroundColor White
Write-Host "  [5] Qoder (AppData\Roaming\Qoder & ~/.qoder)" -ForegroundColor White
Write-Host "  [6] OpenCode / Open Code Interpreter (~/.opencode)" -ForegroundColor White
Write-Host "  [7] VS Code (Continue Extension & settings.json)" -ForegroundColor White
Write-Host "  [8] متغيرات النظام العامة (Global System & User Env: OPENAI_BASE_URL, OPENAI_API_KEY)" -ForegroundColor White
Write-Host "  [9] 🚀 تهيئة جميع البرامج السابقة دفعة واحدة (ALL OF THE ABOVE - ينصح به)" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "اكتب رقم اختيارك [1-9] (Default: 9)"
if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "9"
}

# Helper: Read JSON file safely
function Get-JsonFileContent($filePath) {
    if (Test-Path $filePath) {
        try {
            $raw = Get-Content -Path $filePath -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                return $raw | ConvertFrom-Json
            }
        } catch {}
    }
    return [PSCustomObject]@{}
}

# Helper: Save JSON file safely
function Save-JsonFileContent($filePath, $jsonObject) {
    $parentDir = Split-Path -Parent $filePath
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    $jsonStr = $jsonObject | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($filePath, $jsonStr, [System.Text.Encoding]::UTF8)
}

# 1. Configure Cursor
function Configure-Cursor {
    Write-Host "[*] جارٍ تهيئة Cursor..." -ForegroundColor Cyan
    $cursorPath = Join-Path $env:APPDATA "Cursor\User\settings.json"
    $cfg = Get-JsonFileContent $cursorPath

    $cfg | Add-Member -Name "cursor.general.openAiBaseUrl" -Value "https://ai.subsc.tech/v1" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "cursor.general.openAiApiKey" -Value $subscKey -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "cursor.general.openAiModel" -Value "gpt-6.1-sol" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "cursor.general.overrideOpenAiBaseUrl" -Value $true -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "cursor.models" -Value @("gpt-6.1-sol", "astra", "gpt-6", "gpt-4o") -MemberType NoteProperty -Force

    Save-JsonFileContent $cursorPath $cfg
    Write-Host "    [OK] تم تعديل إعدادات Cursor بنجاح في: $cursorPath" -ForegroundColor Green
}

# 2. Configure Cline
function Configure-Cline {
    Write-Host "[*] جارٍ تهيئة Cline..." -ForegroundColor Cyan
    $codeSettingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
    $cfg = Get-JsonFileContent $codeSettingsPath

    $cfg | Add-Member -Name "claude-dev.apiProvider" -Value "openai-compatible" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "claude-dev.openAiBaseUrl" -Value "https://ai.subsc.tech/v1" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "claude-dev.openAiApiKey" -Value $subscKey -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "claude-dev.openAiModelId" -Value "gpt-6.1-sol" -MemberType NoteProperty -Force

    Save-JsonFileContent $codeSettingsPath $cfg

    # Also Cline globalStorage custom models
    $clineGlobalDir = Join-Path $env:APPDATA "Code\User\globalStorage\saoudrizwan.claude-dev\settings"
    if (Test-Path $clineGlobalDir) {
        $clineCustomPath = Join-Path $clineGlobalDir "cline_custom_modes.json"
        $clineCfg = Get-JsonFileContent $clineCustomPath
        $clineCfg | Add-Member -Name "openAiBaseUrl" -Value "https://ai.subsc.tech/v1" -MemberType NoteProperty -Force
        $clineCfg | Add-Member -Name "openAiApiKey" -Value $subscKey -MemberType NoteProperty -Force
        $clineCfg | Add-Member -Name "openAiModelId" -Value "gpt-6.1-sol" -MemberType NoteProperty -Force
        Save-JsonFileContent $clineCustomPath $clineCfg
    }

    Write-Host "    [OK] تم تعديل إعدادات Cline بنجاح في: $codeSettingsPath" -ForegroundColor Green
}

# 3. Configure Roo Code
function Configure-RooCode {
    Write-Host "[*] جارٍ تهيئة Roo Code..." -ForegroundColor Cyan
    $codeSettingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
    $cfg = Get-JsonFileContent $codeSettingsPath

    $cfg | Add-Member -Name "roo-cline.apiProvider" -Value "openai-compatible" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "roo-cline.openAiBaseUrl" -Value "https://ai.subsc.tech/v1" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "roo-cline.openAiApiKey" -Value $subscKey -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "roo-cline.openAiModelId" -Value "gpt-6.1-sol" -MemberType NoteProperty -Force

    Save-JsonFileContent $codeSettingsPath $cfg
    Write-Host "    [OK] تم تعديل إعدادات Roo Code بنجاح!" -ForegroundColor Green
}

# 4. Configure Windsurf
function Configure-Windsurf {
    Write-Host "[*] جارٍ تهيئة Windsurf..." -ForegroundColor Cyan
    $windsurfPath = Join-Path $env:APPDATA "Windsurf\User\settings.json"
    $cfg = Get-JsonFileContent $windsurfPath

    $cfg | Add-Member -Name "windsurf.openai.baseUrl" -Value "https://ai.subsc.tech/v1" -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "windsurf.openai.apiKey" -Value $subscKey -MemberType NoteProperty -Force
    $cfg | Add-Member -Name "windsurf.openai.model" -Value "gpt-6.1-sol" -MemberType NoteProperty -Force

    Save-JsonFileContent $windsurfPath $cfg
    Write-Host "    [OK] تم تعديل إعدادات Windsurf بنجاح في: $windsurfPath" -ForegroundColor Green
}

# 5. Configure Qoder
function Configure-Qoder {
    Write-Host "[*] جارٍ تهيئة Qoder..." -ForegroundColor Cyan
    $qoderDir1 = Join-Path $env:APPDATA "Qoder"
    $qoderDir2 = Join-Path $env:USERPROFILE ".qoder"

    $qoderConfig = [PSCustomObject]@{
        provider = "openai-compatible"
        baseUrl = "https://ai.subsc.tech/v1"
        apiKey = $subscKey
        model = "gpt-6.1-sol"
        models = @("gpt-6.1-sol", "gpt-4o")
        stream = $true
        updatedAt = (Get-Date).ToString("o")
    }

    Save-JsonFileContent (Join-Path $qoderDir1 "config.json") $qoderConfig
    Save-JsonFileContent (Join-Path $qoderDir2 "config.json") $qoderConfig
    Write-Host "    [OK] تم إنشاء ملف إعدادات Qoder بنجاح!" -ForegroundColor Green
}

# 6. Configure OpenCode / Open Code Interpreter
function Configure-OpenCode {
    Write-Host "[*] جارٍ تهيئة OpenCode..." -ForegroundColor Cyan
    $opencodeDir = Join-Path $env:USERPROFILE ".opencode"
    $opencodeConfig = [PSCustomObject]@{
        model = "gpt-6.1-sol"
        api_base = "https://ai.subsc.tech/v1"
        api_key = $subscKey
        openai_api_base = "https://ai.subsc.tech/v1"
        openai_api_key = $subscKey
        stream = $true
        temperature = 0.2
    }
    Save-JsonFileContent (Join-Path $opencodeDir "config.json") $opencodeConfig
    Write-Host "    [OK] تم حفظ إعدادات OpenCode بنجاح في: $opencodeDir\config.json" -ForegroundColor Green
}

# 7. Configure Continue Extension
function Configure-Continue {
    Write-Host "[*] جارٍ تهيئة إضافة Continue..." -ForegroundColor Cyan
    $continueDir = Join-Path $env:USERPROFILE ".continue"
    $continuePath = Join-Path $continueDir "config.json"
    $cfg = Get-JsonFileContent $continuePath

    $subscModel = [PSCustomObject]@{
        title = "SubscAPI (gpt-6.1-sol)"
        provider = "openai"
        model = "gpt-6.1-sol"
        apiKey = $subscKey
        apiBase = "https://ai.subsc.tech/v1"
    }

    $existingModels = @()
    if ($cfg.models) {
        $existingModels = @($cfg.models | Where-Object { $_.title -ne "SubscAPI (gpt-6.1-sol)" })
    }
    $cfg | Add-Member -Name "models" -Value (@($subscModel) + $existingModels) -MemberType NoteProperty -Force

    Save-JsonFileContent $continuePath $cfg
    Write-Host "    [OK] تم ضبط إضافة Continue بنجاح!" -ForegroundColor Green
}

# 8. Configure System / User Environment Variables
function Configure-Environment {
    Write-Host "[*] جارٍ تعيين متغيرات البيئة الدائمة على نظام Windows..." -ForegroundColor Cyan
    
    [System.Environment]::SetEnvironmentVariable("OPENAI_BASE_URL", "https://ai.subsc.tech/v1", "User")
    [System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", $subscKey, "User")
    [System.Environment]::SetEnvironmentVariable("OPENAI_MODEL", "gpt-6.1-sol", "User")
    [System.Environment]::SetEnvironmentVariable("SUBSC_API_KEY", $subscKey, "User")

    $env:OPENAI_BASE_URL = "https://ai.subsc.tech/v1"
    $env:OPENAI_API_KEY = $subscKey
    $env:OPENAI_MODEL = "gpt-6.1-sol"
    $env:SUBSC_API_KEY = $subscKey

    Write-Host "    [OK] تم تعيين OPENAI_BASE_URL = https://ai.subsc.tech/v1" -ForegroundColor Green
    Write-Host "    [OK] تم تعيين OPENAI_API_KEY  = $subscKey" -ForegroundColor Green
    Write-Host "    [OK] تم تعيين OPENAI_MODEL    = gpt-6.1-sol" -ForegroundColor Green
}

# Execute Selected Actions
switch ($choice) {
    "1" { Configure-Cursor }
    "2" { Configure-Cline }
    "3" { Configure-RooCode }
    "4" { Configure-Windsurf }
    "5" { Configure-Qoder }
    "6" { Configure-OpenCode }
    "7" { Configure-Continue }
    "8" { Configure-Environment }
    default {
        Configure-Cursor
        Configure-Cline
        Configure-RooCode
        Configure-Windsurf
        Configure-Qoder
        Configure-OpenCode
        Configure-Continue
        Configure-Environment
    }
}

# Step 4: Final Verification Test
Write-Host ""
Write-Host "[*] فحص اتصال تجريبي فائق السرعة عبر SubscAPI Gateway..." -ForegroundColor Cyan

try {
    $testPayload = @{
        model = "gpt-6.1-sol"
        messages = @(
            @{ role = "user"; content = "Say OK" }
        )
        max_tokens = 5
        stream = $false
    } | ConvertTo-Json

    $t0 = [System.Diagnostics.Stopwatch]::StartNew()
    $testResp = Invoke-RestMethod -Uri "https://ai.subsc.tech/v1/chat/completions" -Method POST -Headers @{
        Authorization = "Bearer $subscKey"
        "Content-Type" = "application/json"
    } -Body $testPayload -TimeoutSec 15 -ErrorAction Stop
    $t0.Stop()

    $latencyMs = $t0.ElapsedMilliseconds
    $content = $testResp.choices[0].message.content.Trim()

    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host "  🎉 تم اكتمال الإعداد والتأكد من الاتصال بنجاح 100%!               " -ForegroundColor Green
    Write-Host "  زمن الاستجابة: ${latencyMs}ms | رد الذكاء الاصطناعي: $content     " -ForegroundColor Green
    Write-Host "  أعد تشغيل محرر الأكواد (Cursor / VS Code / Windsurf) وابدأ العمل!" -ForegroundColor White
    Write-Host "===================================================================" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[!] اكتملت التهيئة على جهازك بنجاح. أعد تشغيل المحرر للتطبيق." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "شكراً لاستخدامك SubscAPI! لمزيد من الدعم تواصل مع t.me/subscnow" -ForegroundColor Cyan
