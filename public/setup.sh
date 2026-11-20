#!/usr/bin/env bash
# =====================================================================
# SubscAPI - One-Click Automatic IDE & Environment Configurator (macOS / Linux)
# Supports: Cursor, Windsurf, Cline, Roo Code, Qoder, OpenCode, VS Code, Global Env
# Base URL: https://ai.subsc.tech/v1
# =====================================================================

set -e

echo ""
echo -e "\033[1;36m===================================================================\033[0m"
echo -e "\033[1;33m       ⚡ SubscAPI - Auto-Configurator for AI IDEs & Tools ⚡       \033[0m"
echo -e "\033[1;37m      المثبت والمهيئ التلقائي لبرامج البرمجة بالذكاء الاصطناعي      \033[0m"
echo -e "\033[1;36m===================================================================\033[0m"
echo -e "\033[0;37m Gateway Endpoint: https://ai.subsc.tech/v1\033[0m"
echo -e "\033[0;37m Active Engine:    gpt-6.1-sol / gpt-4o (Ultra-fast streaming)\033[0m"
echo -e "\033[1;36m===================================================================\033[0m"
echo ""

# Prompt for API Key
SUBSC_KEY=""
while [ -z "$SUBSC_KEY" ]; do
  echo -e "\033[1;32m[?] ادخل مفتاح SubscAPI الخاص بك (Enter your API Key):\033[0m"
  read -p "    (sk-subsc-...): " SUBSC_KEY
  SUBSC_KEY=$(echo "$SUBSC_KEY" | tr -d '[:space:]')
done

echo ""
echo -e "\033[1;36m[*] جارٍ التحقق من المفتاح مع سيرفر SubscAPI المباشر...\033[0m"

curl -s -X POST "https://ai.subsc.tech/api/client/check-key" \
  -H "Content-Type: application/json" \
  -d "{\"clientKey\":\"$SUBSC_KEY\"}" > /tmp/subsc_verify.json || true

if grep -q '"success":true' /tmp/subsc_verify.json 2>/dev/null; then
  echo -e "\033[1;32m[+] تم التحقق بنجاح من المفتاح وحالته نشطة!\033[0m"
else
  echo -e "\033[1;33m[!] سيتم إكمال التهيئة للمفتاح محلياً.\033[0m"
fi

# Detect OS
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" = "Darwin" ]; then
  CURSOR_CONFIG="$HOME/Library/Application Support/Cursor/User/settings.json"
  CODE_CONFIG="$HOME/Library/Application Support/Code/User/settings.json"
  WINDSURF_CONFIG="$HOME/Library/Application Support/Windsurf/User/settings.json"
else
  CURSOR_CONFIG="$HOME/.config/Cursor/User/settings.json"
  CODE_CONFIG="$HOME/.config/Code/User/settings.json"
  WINDSURF_CONFIG="$HOME/.config/Windsurf/User/settings.json"
fi

# Function to update JSON file with jq or python
update_json() {
  local file="$1"
  local key="$2"
  local val="$3"
  mkdir -p "$(dirname "$file")"
  if [ ! -f "$file" ]; then echo "{}" > "$file"; fi
  python3 -c "
import json, sys
p = sys.argv[1]
try:
  with open(p, 'r') as f: data = json.load(f)
except: data = {}
data['$key'] = '$val'
with open(p, 'w') as f: json.dump(data, f, indent=2)
" "$file" 2>/dev/null || true
}

echo ""
echo -e "\033[1;36m[*] جاري تطبيق الإعدادات على محركات وبرامج التطوير...\033[0m"

# 1. Cursor
update_json "$CURSOR_CONFIG" "cursor.general.openAiBaseUrl" "https://ai.subsc.tech/v1"
update_json "$CURSOR_CONFIG" "cursor.general.openAiApiKey" "$SUBSC_KEY"
update_json "$CURSOR_CONFIG" "cursor.general.openAiModel" "gpt-6.1-sol"
update_json "$CURSOR_CONFIG" "cursor.models" "[\"gpt-6.1-sol\", \"astra\", \"gpt-6\", \"gpt-4o\"]"
echo -e "\033[1;32m    [OK] تم ضبط إعدادات Cursor بنجاح (gpt-6.1-sol و astra).\033[0m"

# 2. Cline & Roo Code in VS Code
update_json "$CODE_CONFIG" "claude-dev.apiProvider" "openai-compatible"
update_json "$CODE_CONFIG" "claude-dev.openAiBaseUrl" "https://ai.subsc.tech/v1"
update_json "$CODE_CONFIG" "claude-dev.openAiApiKey" "$SUBSC_KEY"
update_json "$CODE_CONFIG" "claude-dev.openAiModelId" "gpt-6.1-sol"
update_json "$CODE_CONFIG" "roo-cline.apiProvider" "openai-compatible"
update_json "$CODE_CONFIG" "roo-cline.openAiBaseUrl" "https://ai.subsc.tech/v1"
update_json "$CODE_CONFIG" "roo-cline.openAiApiKey" "$SUBSC_KEY"
update_json "$CODE_CONFIG" "roo-cline.openAiModelId" "gpt-6.1-sol"
echo -e "\033[1;32m    [OK] تم ضبط إعدادات Cline و Roo Code بنجاح.\033[0m"

# 3. Windsurf
update_json "$WINDSURF_CONFIG" "windsurf.openai.baseUrl" "https://ai.subsc.tech/v1"
update_json "$WINDSURF_CONFIG" "windsurf.openai.apiKey" "$SUBSC_KEY"
update_json "$WINDSURF_CONFIG" "windsurf.openai.model" "gpt-6.1-sol"
echo -e "\033[1;32m    [OK] تم ضبط إعدادات Windsurf بنجاح.\033[0m"

# 4. Qoder & OpenCode
mkdir -p "$HOME/.qoder" "$HOME/.opencode"
echo "{\"provider\":\"openai-compatible\",\"baseUrl\":\"https://ai.subsc.tech/v1\",\"apiKey\":\"$SUBSC_KEY\",\"model\":\"gpt-6.1-sol\"}" > "$HOME/.qoder/config.json"
echo "{\"model\":\"gpt-6.1-sol\",\"api_base\":\"https://ai.subsc.tech/v1\",\"api_key\":\"$SUBSC_KEY\"}" > "$HOME/.opencode/config.json"
echo -e "\033[1;32m    [OK] تم ضبط إعدادات Qoder و OpenCode بنجاح.\033[0m"

# 5. Shell Environment Profile
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

echo ""
echo -e "\033[1;32m===================================================================\033[0m"
echo -e "\033[1;32m  🎉 اكتمل الإعداد بنجاح! أعد تشغيل المحرر واستمتع بسرعة فائقة.       \033[0m"
echo -e "\033[1;32m===================================================================\033[0m"
