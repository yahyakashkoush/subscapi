#!/usr/bin/env bash
# =====================================================================
# SubscAPI - One-Click Automatic IDE & Environment Configurator (macOS / Linux)
# Supports: Cursor, Windsurf, Cline, Roo Code, Codex, Qoder, OpenCode, VS Code, Global Env
# Models:   gpt-6.1-sol & astra
# Base URL: https://ai.subsc.tech/v1
# =====================================================================

set -e

# Helper to read from terminal even when piped via curl | bash
read_terminal() {
  local prompt="$1"
  local var_name="$2"
  if [ -e /dev/tty ]; then
    read -r -p "$prompt" "$var_name" < /dev/tty
  else
    read -r -p "$prompt" "$var_name"
  fi
}

echo ""
echo -e "\033[1;36m===================================================================\033[0m"
echo -e "\033[1;33m       ⚡ SubscAPI - Auto-Configurator for AI IDEs & Tools ⚡       \033[0m"
echo -e "\033[1;37m      المثبت والمهيئ التلقائي لبرامج البرمجة بالذكاء الاصطناعي      \033[0m"
echo -e "\033[1;36m===================================================================\033[0m"
echo -e "\033[0;37m Gateway Endpoint: https://ai.subsc.tech/v1\033[0m"
echo -e "\033[0;37m Supported Models: gpt-6.1-sol (Flagship Coding) & astra (Ultra-fast)\033[0m"
echo -e "\033[1;36m===================================================================\033[0m"
echo ""

# Step 1: Prompt for API Key (or accept from argument $1)
SUBSC_KEY="${1:-}"

while [ -z "$SUBSC_KEY" ]; do
  echo -e "\033[1;32m[?] ادخل مفتاح SubscAPI الخاص بك (Enter your API Key):\033[0m"
  read_terminal "    (sk-subsc-...): " USER_INPUT
  SUBSC_KEY=$(echo "$USER_INPUT" | tr -d '[:space:]')
  if [ -z "$SUBSC_KEY" ]; then
    echo -e "\033[1;31m[-] عذراً، لا يمكن ترك المفتاح فارغاً. حاول مرة أخرى.\033[0m"
  fi
done

echo ""
echo -e "\033[1;36m[*] جارٍ التحقق من المفتاح مع سيرفر SubscAPI المباشر...\033[0m"

VERIFY_RES=$(curl -s -X POST "https://ai.subsc.tech/api/client/check-key" \
  -H "Content-Type: application/json" \
  -d "{\"clientKey\":\"$SUBSC_KEY\"}" || true)

if echo "$VERIFY_RES" | grep -q '"success":true'; then
  PKG_NAME=$(echo "$VERIFY_RES" | grep -o '"packageName":"[^"]*"' | head -n 1 | cut -d'"' -f4)
  REMAINING=$(echo "$VERIFY_RES" | grep -o '"remainingBalance":[0-9.]*' | head -n 1 | cut -d':' -f2)
  echo -e "\033[1;32m[+] تم التحقق بنجاح من المفتاح!\033[0m"
  echo -e "\033[1;32m    الباقة: ${PKG_NAME:-Standard} | الرصيد المتبقي: \$${REMAINING:-0} | الحالة: نشط\033[0m"
else
  echo -e "\033[1;33m[!] تعذر التحقق اللحظي، سيتم استكمال التهيئة بالمفتاح المدخل محلياً.\033[0m"
fi

# Step 2: Interactive Menu Selection
echo ""
echo -e "\033[1;36mاختر البرنامج الذي ترغب في تهيئته (Select Target): \033[0m"
echo "  [1] Cursor (Library/Application Support/Cursor)"
echo "  [2] Cline (VS Code Extension - Config & Settings)"
echo "  [3] Roo Code (VS Code Extension)"
echo "  [4] Windsurf (Library/Application Support/Windsurf)"
echo "  [5] Qoder (~/.qoder & Application Support)"
echo "  [6] OpenCode / Open Code Interpreter (~/.opencode)"
echo "  [7] Codex (OpenAI Codex CLI - ~/.codex/config.toml & auth.json)"
echo "  [8] VS Code (Continue Extension & settings.json)"
echo "  [9] متغيرات النظام العامة (Environment Variables in ~/.zshrc أو ~/.bashrc)"
echo -e "  \033[1;33m[10] 🚀 تهيئة جميع البرامج السابقة دفعة واحدة (ALL OF THE ABOVE - ينصح به)\033[0m"
echo ""

CHOICE=""
read_terminal "اكتب رقم اختيارك [1-10] (الافتراضي: 10): " CHOICE_INPUT
CHOICE=$(echo "$CHOICE_INPUT" | tr -d '[:space:]')
CHOICE="${CHOICE:-10}"

# Detect OS & Paths
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" = "Darwin" ]; then
  CURSOR_CONFIG="$HOME/Library/Application Support/Cursor/User/settings.json"
  CODE_CONFIG="$HOME/Library/Application Support/Code/User/settings.json"
  WINDSURF_CONFIG="$HOME/Library/Application Support/Windsurf/User/settings.json"
  CLINE_GLOBAL="$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings"
else
  CURSOR_CONFIG="$HOME/.config/Cursor/User/settings.json"
  CODE_CONFIG="$HOME/.config/Code/User/settings.json"
  WINDSURF_CONFIG="$HOME/.config/Windsurf/User/settings.json"
  CLINE_GLOBAL="$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings"
fi

# Safe JSON updater using Python 3
update_json_property() {
  local file="$1"
  local key="$2"
  local val="$3"
  mkdir -p "$(dirname "$file")"
  if [ ! -f "$file" ]; then echo "{}" > "$file"; fi
  python3 -c "
import json, sys
p = sys.argv[1]
try:
  with open(p, 'r', encoding='utf-8') as f: data = json.load(f)
except: data = {}
val = sys.argv[3]
try:
  val_parsed = json.loads(val)
except:
  val_parsed = val
data[sys.argv[2]] = val_parsed
with open(p, 'w', encoding='utf-8') as f: json.dump(data, f, indent=2, ensure_ascii=False)
" "$file" "$key" "$val" 2>/dev/null || true
}

echo ""
echo -e "\033[1;36m[*] جارٍ تطبيق التهيئة على محركات وأدوات التطوير...\033[0m"

# 1. Cursor
configure_cursor() {
  echo -e "\033[1;34m[*] تهيئة Cursor...\033[0m"
  update_json_property "$CURSOR_CONFIG" "cursor.general.openAiBaseUrl" "https://ai.subsc.tech/v1"
  update_json_property "$CURSOR_CONFIG" "cursor.general.openAiApiKey" "$SUBSC_KEY"
  update_json_property "$CURSOR_CONFIG" "cursor.general.openAiModel" "gpt-6.1-sol"
  update_json_property "$CURSOR_CONFIG" "cursor.general.overrideOpenAiBaseUrl" "true"
  update_json_property "$CURSOR_CONFIG" "cursor.models" '["gpt-6.1-sol", "astra", "gpt-6", "gpt-4o"]'
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Cursor بنجاح (gpt-6.1-sol و astra).\033[0m"
}

# 2. Cline
configure_cline() {
  echo -e "\033[1;34m[*] تهيئة Cline...\033[0m"
  update_json_property "$CODE_CONFIG" "claude-dev.apiProvider" "openai-compatible"
  update_json_property "$CODE_CONFIG" "claude-dev.openAiBaseUrl" "https://ai.subsc.tech/v1"
  update_json_property "$CODE_CONFIG" "claude-dev.openAiApiKey" "$SUBSC_KEY"
  update_json_property "$CODE_CONFIG" "claude-dev.openAiModelId" "gpt-6.1-sol"
  if [ -d "$CLINE_GLOBAL" ]; then
    update_json_property "$CLINE_GLOBAL/cline_custom_modes.json" "openAiBaseUrl" "https://ai.subsc.tech/v1"
    update_json_property "$CLINE_GLOBAL/cline_custom_modes.json" "openAiApiKey" "$SUBSC_KEY"
    update_json_property "$CLINE_GLOBAL/cline_custom_modes.json" "openAiModelId" "gpt-6.1-sol"
  fi
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Cline بنجاح.\033[0m"
}

# 3. Roo Code
configure_roocode() {
  echo -e "\033[1;34m[*] تهيئة Roo Code...\033[0m"
  update_json_property "$CODE_CONFIG" "roo-cline.apiProvider" "openai-compatible"
  update_json_property "$CODE_CONFIG" "roo-cline.openAiBaseUrl" "https://ai.subsc.tech/v1"
  update_json_property "$CODE_CONFIG" "roo-cline.openAiApiKey" "$SUBSC_KEY"
  update_json_property "$CODE_CONFIG" "roo-cline.openAiModelId" "gpt-6.1-sol"
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Roo Code بنجاح.\033[0m"
}

# 4. Windsurf
configure_windsurf() {
  echo -e "\033[1;34m[*] تهيئة Windsurf...\033[0m"
  update_json_property "$WINDSURF_CONFIG" "windsurf.openai.baseUrl" "https://ai.subsc.tech/v1"
  update_json_property "$WINDSURF_CONFIG" "windsurf.openai.apiKey" "$SUBSC_KEY"
  update_json_property "$WINDSURF_CONFIG" "windsurf.openai.model" "gpt-6.1-sol"
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Windsurf بنجاح.\033[0m"
}

# 5. Qoder
configure_qoder() {
  echo -e "\033[1;34m[*] تهيئة Qoder...\033[0m"
  mkdir -p "$HOME/.qoder"
  echo "{\"provider\":\"openai-compatible\",\"baseUrl\":\"https://ai.subsc.tech/v1\",\"apiKey\":\"$SUBSC_KEY\",\"model\":\"gpt-6.1-sol\",\"models\":[\"gpt-6.1-sol\",\"astra\",\"gpt-6\",\"gpt-4o\"],\"stream\":true}" > "$HOME/.qoder/config.json"
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Qoder بنجاح.\033[0m"
}

# 6. OpenCode
configure_opencode() {
  echo -e "\033[1;34m[*] تهيئة OpenCode...\033[0m"
  mkdir -p "$HOME/.opencode"
  echo "{\"model\":\"gpt-6.1-sol\",\"api_base\":\"https://ai.subsc.tech/v1\",\"api_key\":\"$SUBSC_KEY\",\"openai_api_base\":\"https://ai.subsc.tech/v1\",\"openai_api_key\":\"$SUBSC_KEY\",\"stream\":true}" > "$HOME/.opencode/config.json"
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات OpenCode بنجاح.\033[0m"
}

# 7. Codex (OpenAI Codex CLI & Desktop)
configure_codex() {
  echo -e "\033[1;34m[*] تهيئة Codex CLI (~/.codex)...\033[0m"
  mkdir -p "$HOME/.codex"
  cat <<EOF > "$HOME/.codex/config.toml"
model = "gpt-6.1-sol"
model_provider = "subscapi"

[model_providers.subscapi]
name = "SubscAPI Gateway"
base_url = "https://ai.subsc.tech/v1"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
EOF

  cat <<EOF > "$HOME/.codex/auth.json"
{
  "OPENAI_API_KEY": "$SUBSC_KEY"
}
EOF

  cat <<EOF > "$HOME/.codex/config.json"
{
  "model": "gpt-6.1-sol",
  "model_provider": "subscapi",
  "base_url": "https://ai.subsc.tech/v1",
  "api_key": "$SUBSC_KEY",
  "openai_api_base": "https://ai.subsc.tech/v1",
  "openai_api_key": "$SUBSC_KEY",
  "wire_api": "responses",
  "stream": true
}
EOF
  echo -e "\033[1;32m    [OK] تم ضبط إعدادات Codex بنجاح (~/.codex/config.toml و auth.json).\033[0m"
}

# 8. Continue Extension
configure_continue() {
  echo -e "\033[1;34m[*] تهيئة إضافة Continue...\033[0m"
  local cont_path="$HOME/.continue/config.json"
  mkdir -p "$HOME/.continue"
  if [ ! -f "$cont_path" ]; then echo "{}" > "$cont_path"; fi
  python3 -c "
import json
p = '$cont_path'
try:
  with open(p, 'r') as f: data = json.load(f)
except: data = {}
models = data.get('models', [])
models = [m for m in models if m.get('title') not in ['SubscAPI (gpt-6.1-sol)', 'SubscAPI (astra)']]
models.insert(0, {'title': 'SubscAPI (gpt-6.1-sol)', 'provider': 'openai', 'model': 'gpt-6.1-sol', 'apiKey': '$SUBSC_KEY', 'apiBase': 'https://ai.subsc.tech/v1'})
models.insert(1, {'title': 'SubscAPI (astra)', 'provider': 'openai', 'model': 'astra', 'apiKey': '$SUBSC_KEY', 'apiBase': 'https://ai.subsc.tech/v1'})
data['models'] = models
with open(p, 'w') as f: json.dump(data, f, indent=2)
" 2>/dev/null || true
  echo -e "\033[1;32m    [OK] تم ضبط إضافة Continue بنجاح.\033[0m"
}

# 9. Environment Variables
configure_env() {
  echo -e "\033[1;34m[*] حفظ متغيرات البيئة الدائمة...\033[0m"
  SHELL_RC="$HOME/.bashrc"
  if [ "$OS_TYPE" = "Darwin" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
  fi
  if ! grep -q "OPENAI_BASE_URL.*subsc" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# SubscAPI AI Gateway" >> "$SHELL_RC"
    echo "export OPENAI_BASE_URL=\"https://ai.subsc.tech/v1\"" >> "$SHELL_RC"
    echo "export OPENAI_API_KEY=\"$SUBSC_KEY\"" >> "$SHELL_RC"
    echo "export OPENAI_MODEL=\"gpt-6.1-sol\"" >> "$SHELL_RC"
    echo "export SUBSC_API_KEY=\"$SUBSC_KEY\"" >> "$SHELL_RC"
  fi
  echo -e "\033[1;32m    [OK] تم حفظ متغيرات البيئة الدائمة في $SHELL_RC\033[0m"
}

case "$CHOICE" in
  1) configure_cursor ;;
  2) configure_cline ;;
  3) configure_roocode ;;
  4) configure_windsurf ;;
  5) configure_qoder ;;
  6) configure_opencode ;;
  7) configure_codex ;;
  8) configure_continue ;;
  9) configure_env ;;
  *)
    configure_cursor
    configure_cline
    configure_roocode
    configure_windsurf
    configure_qoder
    configure_opencode
    configure_codex
    configure_continue
    configure_env
    ;;
esac

# Step 3: Fast Live Verification Test
echo ""
echo -e "\033[1;36m[*] فحص اتصال تجريبي فائق السرعة عبر SubscAPI Gateway...\033[0m"

TEST_RES=$(curl -s -X POST "https://ai.subsc.tech/v1/chat/completions" \
  -H "Authorization: Bearer $SUBSC_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-6.1-sol","messages":[{"role":"user","content":"Say OK"}],"max_tokens":5}' || true)

if echo "$TEST_RES" | grep -q 'choices'; then
  CONTENT=$(echo "$TEST_RES" | grep -o '"content":"[^"]*"' | head -n 1 | cut -d'"' -f4)
  echo -e "\033[1;32m===================================================================\033[0m"
  echo -e "\033[1;32m  🎉 تم اكتمال الإعداد والتأكد من الاتصال بنجاح 100%!               \033[0m"
  echo -e "\033[1;32m  رد الذكاء الاصطناعي: ${CONTENT:-OK} | النماذج الجاهزة: gpt-6.1-sol و astra   \033[0m"
  echo -e "\033[1;37m  أعد تشغيل محرر الأكواد (Cursor / VS Code / Windsurf) وابدأ العمل! \033[0m"
  echo -e "\033[1;32m===================================================================\033[0m"
else
  echo -e "\033[1;32m===================================================================\033[0m"
  echo -e "\033[1;32m  🎉 اكتملت كتابة الإعدادات بنجاح في جهازك. أعد تشغيل المحرر للبدء!  \033[0m"
  echo -e "\033[1;32m===================================================================\033[0m"
fi

echo ""
echo -e "\033[1;36mشكراً لاستخدامك SubscAPI! للدعم والمساعدة تواصل مع t.me/subscnow\033[0m"
