import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Terminal, Box, Check, ArrowUpLeft, Zap, Laptop, Layers, Apple, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyBox } from "@/components/subsc-controls";
import { metadata } from "@/lib/subsc";

export const Route = createFileRoute("/guide")({
  head: () =>
    metadata(
      "دليل الربط للمطورين والمحررات",
      "اربط مفتاح SubscAPI تلقائياً أو يدوياً مع نماذج gpt-6.1-sol و ASTRA في Cursor وCline وWindsurf وQoder وOpenCode.",
    ),
  component: Guide,
});

const endpoint = "https://ai.subsc.tech/v1";

const guides = [
  {
    name: "⚡ التثبيت التلقائي (Windows & Mac)",
    icon: Zap,
    title: "أمر واحد في الطرفية، والإعدادات تُعدّل تلقائياً لكل أدواتك.",
    steps: [
      "اختر نظام التشغيل لجهازك (Windows PowerShell أو Mac / Linux Terminal).",
      "انسخ الأمر وشغّله: سيطلب منك لصق مفتاح SubscAPI واختيار برنامجك المفضل أو الكل.",
      "يقوم السكربت تلقائياً بالدخول لملفات البرامج وإعداد النماذج gpt-6.1-sol و astra مع فحص الاتصال!",
    ],
    code: `# لأنظمة Windows (PowerShell):\nirm https://ai.subsc.tech/setup.ps1 | iex\n\n# لأنظمة macOS / Linux (Terminal):\ncurl -sSL https://ai.subsc.tech/setup.sh | bash`,
  },
  {
    name: "Cursor / Windsurf",
    icon: Box,
    title: "أدواتك المفضلة. اختر بين gpt-6.1-sol و ASTRA.",
    steps: [
      "افتح إعدادات التطبيق (Settings) ثم انتقل إلى Models أو AI Providers.",
      "فعّل خيار Override OpenAI Base URL وأدخل رابط الخدمة: https://ai.subsc.tech/v1.",
      "أضف مفتاح SubscAPI الخاص بك، ثم اختر النموذج المناسب لمهمتك:",
      "• اختر gpt-6.1-sol للمشاريع البرمجية الكبيرة والوكلاء الذكية.",
      "• اختر astra (أو gpt-6) للاستجابة السريعة وتوليد الأكواد الفورية.",
    ],
    code: `Base URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\n\n# النماذج المتاحة:\nModel 1: gpt-6.1-sol   (للبرمجة العميقة والوكلاء)\nModel 2: astra        (للاستجابة السريعة)`,
  },
  {
    name: "Cline / Roo Code",
    icon: Code2,
    title: "وكيلك الذكي في VS Code، متصل وجاهز.",
    steps: [
      "افتح إعدادات إضافة Cline أو Roo Code في VS Code.",
      "اختر OpenAI Compatible من قائمة API Provider.",
      "في خانة Model Source URL ضع: https://ai.subsc.tech/v1/models ليجلب النماذج تلقائياً.",
      "في خانة Models اكتب gpt-6.1-sol أو astra ثم اضغط Enter في الكيبورد لتثبيتها.",
      "الصق مفتاحك sk-subsc-YOUR-KEY وفعّل streaming و tools.",
    ],
    code: `API Provider: OpenAI Compatible\nBase URL: ${endpoint}\nModel Source URL: ${endpoint}/models\nModels: gpt-6.1-sol, astra\nAPI Key: sk-subsc-YOUR-KEY`,
  },
  {
    name: "Qoder",
    icon: Laptop,
    title: "توليد أكواد متطورة وسريعة مع Qoder.",
    steps: [
      "افتح إعدادات مزودي الذكاء الاصطناعي (AI Providers) في Qoder.",
      "اختر مزود OpenAI Compatible مخصص وضع Base URL: https://ai.subsc.tech/v1.",
      "أدخل مفتاحك، وحدد النموذج gpt-6.1-sol أو astra.",
    ],
    code: `Provider: OpenAI-Compatible\nBase URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\nModel: gpt-6.1-sol (أو astra)`,
  },
  {
    name: "OpenCode",
    icon: Layers,
    title: "تشغيل الأكواد والوكلاء مع OpenCode.",
    steps: [
      "في ملف إعدادات OpenCode أو المتغيرات البيئية، وجّه الاتصال إلى SubscAPI.",
      "استخدم gpt-6.1-sol أو astra كنموذج لمعالجة المهام البرمجية.",
    ],
    code: `openai_api_base="${endpoint}"\nopenai_api_key="sk-subsc-YOUR-KEY"\nmodel="gpt-6.1-sol"\n# أو للنموذج السريع:\n# model="astra"`,
  },
  {
    name: "Codex (CLI & Desktop)",
    icon: Terminal,
    title: "أداة Codex الرسمية. ربط فوري عبر ملف config.toml أو auth.json.",
    steps: [
      "مسار ملف الإعداد: للماك ~/.codex/config.toml وللويندوز %USERPROFILE%\\.codex\\config.toml.",
      "عيّن wire_api إلى 'responses' لضمان أعلى سرعة لمعالجة طلبات الوكيل.",
      "أضف مفتاحك في ملف ~/.codex/auth.json أو في متغيرات النظام OPENAI_API_KEY.",
      "يمكنك أيضاً التهيئة التلقائية بضغطة زر عبر أمر PowerShell أو Terminal!",
    ],
    code: `# ملف الإعداد: ~/.codex/config.toml (ماك) أو %USERPROFILE%\\.codex\\config.toml (ويندوز)\nmodel = "gpt-6.1-sol"\nmodel_provider = "subscapi"\n\n[model_providers.subscapi]\nname = "SubscAPI Gateway"\nbase_url = "${endpoint}"\nwire_api = "responses"\nenv_key = "OPENAI_API_KEY"\n\n# ملف المفتاح: ~/.codex/auth.json\n{\n  "OPENAI_API_KEY": "sk-subsc-YOUR-KEY"\n}`,
  },
  {
    name: "Python SDK",
    icon: Code2,
    title: "من الفكرة إلى الكود مع OpenAI SDK الرسمي.",
    steps: [
      "ثبّت مكتبة OpenAI الرسمية باستخدام pip install openai.",
      "أضف مفتاحك ووجه base_url إلى رابط البوابة.",
      "يمكنك التبديل بين نموذج gpt-6.1-sol و astra بسهولة تامة.",
    ],
    code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-subsc-YOUR-KEY",\n    base_url="${endpoint}"\n)\n\n# 1. طلب عبر نموذج gpt-6.1-sol البرمجي\nresponse = client.chat.completions.create(\n    model="gpt-6.1-sol",\n    messages=[{"role": "user", "content": "اكتب لي كود بايثون متكامل."}]\n)\nprint("SOL:", response.choices[0].message.content)\n\n# 2. طلب عبر نموذج ASTRA السريع\nresponse_astra = client.chat.completions.create(\n    model="astra",\n    messages=[{"role": "user", "content": "مرحباً!"}]\n)\nprint("ASTRA:", response_astra.choices[0].message.content)`,
  },
  {
    name: "cURL / Terminal",
    icon: Terminal,
    title: "طلبك المباشر، من الطرفية في ثوانٍ.",
    steps: [
      "انسخ الأمر التالي وشغّله من الطرفية مباشرة للتأكد من سرعة الاستجابة.",
      "يدعم كلاً من التدفق اللحظي عبر stream: true أو الرد الكامل المباشر.",
    ],
    code: `# تجربة نموذج gpt-6.1-sol (مع البث التدفقي Streaming):\ncurl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer sk-subsc-YOUR-KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-6.1-sol",\n    "messages": [{"role": "user", "content": "Say hello"}],\n    "stream": true\n  }'\n\n# تجربة نموذج ASTRA:\ncurl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer sk-subsc-YOUR-KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "astra",\n    "messages": [{"role": "user", "content": "Hello Astra"}],\n    "stream": false\n  }'`,
  },
];

function Guide() {
  const [tab, setTab] = useState(0);
  const guide = guides[tab];
  if (!guide) return null;

  return (
    <section className="utility-page guide-page">
      <div className="section-heading">
        <div className="section-kicker">
          <Code2 size={16} />
          صُمم للمطورين والمحررات
        </div>
        <h1>
          اربط مرة. <span>وابنِ بلا حدود.</span>
        </h1>
        <p>متوافق 100% مع OpenAI SDK والبروتوكول القياسي، ويدعم نموذجي <strong>gpt-6.1-sol</strong> و <strong>ASTRA</strong> بكفاءة وسرعة فائقة.</p>
      </div>

      {/* Auto-Installer Banner Hero (Windows & Mac) */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-transparent border border-amber-500/30 mb-8 space-y-4 text-right">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500">
          <Zap size={14} />
          الربط التلقائي بضغطة زر واحدة (Windows & macOS)
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">
            لا تريد تعديل الإعدادات يدوياً؟ السكربت التلقائي يقوم بكل شيء!
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            يقوم بطلب مفتاحك وتعديل ملفات الإعدادات تلقائياً في Cursor وCline وWindsurf وQoder وOpenCode مع إضافة نموذجي <strong>gpt-6.1-sol</strong> و <strong>ASTRA</strong> وفحص سرعة الاتصال.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2" dir="ltr">
          {/* Windows PowerShell */}
          <div className="p-4 rounded-xl bg-card/80 border border-border space-y-2 text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Monitor size={15} className="text-cyan-500" />
              <span>Windows (PowerShell)</span>
            </div>
            <CopyBox value="irm https://ai.subsc.tech/setup.ps1 | iex" label="Windows PowerShell" />
          </div>

          {/* macOS / Linux */}
          <div className="p-4 rounded-xl bg-card/80 border border-border space-y-2 text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Apple size={15} className="text-emerald-500" />
              <span>macOS & Linux (Terminal)</span>
            </div>
            <CopyBox value="curl -sSL https://ai.subsc.tech/setup.sh | bash" label="macOS / Linux Terminal" />
          </div>
        </div>
      </div>

      {/* Models Reference Pill Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-right">
        <div className="p-4 rounded-xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">gpt-6.1-sol</span>
            <span className="text-xs font-bold text-foreground">النموذج البرمجي الأقوى</span>
          </div>
          <p className="text-xs text-muted-foreground">
            مخصص للمهام البرمجية العميقة، والوكلاء الذكية (Cline / Cursor / Roo Code)، وتوليد المشاريع الكاملة بدقة متناهية.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">astra (أو gpt-6)</span>
            <span className="text-xs font-bold text-foreground">نموذج الاستجابة السريعة</span>
          </div>
          <p className="text-xs text-muted-foreground">
            مخصص للسرعة الفائقة، وتوليد الأفكار، والأكواد الخفيفة، والمحادثات المباشرة بأقل زمن استجابة.
          </p>
        </div>
      </div>

      <div className="guide-tabs" role="tablist" aria-label="أداة الربط" dir="ltr">
        {guides.map((item, index) => (
          <Button
            variant="ghost"
            key={item.name}
            role="tab"
            aria-selected={tab === index}
            aria-controls="guide-panel"
            id={`guide-tab-${index}`}
            onClick={() => setTab(index)}
            className={tab === index ? "selected-tab" : undefined}
          >
            <item.icon />
            {item.name}
          </Button>
        ))}
      </div>

      <div
        className="guide-content"
        role="tabpanel"
        id="guide-panel"
        aria-labelledby={`guide-tab-${tab}`}
      >
        <div className="guide-steps">
          <h2>{guide.title}</h2>
          <ol>
            {guide.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <div className="guide-note">
            <Check size={16} />
            يدعم كلا النموذجين (gpt-6.1-sol و ASTRA) وبث تدفقي مستقر بدون تقطيع.
          </div>
        </div>
        <div className="code-panel">
          <div className="code-title">
            <span className="code-dots">● ● ●</span>
            <span dir="ltr">
              {guide.name.includes("Python")
                ? "getting_started.py"
                : guide.name.includes("التثبيت")
                ? "auto_setup"
                : "connection.config"}
            </span>
            <Terminal size={15} />
          </div>
          <CopyBox value={guide.code} label="كود الربط المباشر" />
        </div>
      </div>

      <div className="endpoint-row">
        <div>
          <span className="section-kicker">عنوان الخدمة العام</span>
          <h3>نقطة اتصال واحدة فائقة السرعة لكل أدواتك</h3>
        </div>
        <CopyBox value={endpoint} label="Base URL" />
      </div>

      <Button variant="link" asChild>
        <a href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noreferrer">
          مرجع OpenAI API
          <ArrowUpLeft />
        </a>
      </Button>
    </section>
  );
}
