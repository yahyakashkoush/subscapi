import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Terminal, Box, Check, ArrowUpLeft, Zap, Laptop, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyBox } from "@/components/subsc-controls";
import { metadata } from "@/lib/subsc";

export const Route = createFileRoute("/guide")({
  head: () =>
    metadata(
      "دليل الربط للمطورين والمحررات",
      "اربط مفتاح SubscAPI تلقائياً أو يدوياً مع Cursor وCline وWindsurf وQoder وOpenCode وPython.",
    ),
  component: Guide,
});

const endpoint = "https://ai.subsc.tech/v1";

const guides = [
  {
    name: "⚡ التثبيت التلقائي (PowerShell)",
    icon: Zap,
    title: "أمر واحد في PowerShell، والملفات تتعدل تلقائياً.",
    steps: [
      "افتح Windows PowerShell على جهازك.",
      "انسخ الأمر وشغله: سيطلب منك لصق مفتاح SubscAPI واختيار برنامجك المفضل.",
      "يقوم السكربت تلقائياً بالدخول لملفات البرامج في القرص C: وتهيئة الإعدادات والموديل وفحص الاتصال!",
    ],
    code: `irm https://ai.subsc.tech/setup.ps1 | iex`,
  },
  {
    name: "Cursor / Windsurf",
    icon: Box,
    title: "أدواتك المفضلة. قوة استجابة فائقة.",
    steps: [
      "افتح إعدادات التطبيق (Settings) ثم انتقل إلى Models أو AI Providers.",
      "فعّل خيار Override OpenAI Base URL وأدخل رابط الخدمة أدناه.",
      "أضف مفتاح SubscAPI الخاص بك، ثم اختر النموذج gpt-6.1-sol.",
    ],
    code: `Base URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\nModel: gpt-6.1-sol`,
  },
  {
    name: "Cline / Roo Code",
    icon: Code2,
    title: "وكيلك الذكي، متصل وجاهز.",
    steps: [
      "افتح إعدادات إضافة Cline أو Roo Code في VS Code.",
      "اختر OpenAI Compatible من قائمة API Provider.",
      "في خانة Model Source URL (Optional) ضع: https://ai.subsc.tech/v1/models ليجلب النماذج تلقائياً.",
      "في خانة Models اكتب gpt-6.1-sol ثم اضغط Enter في الكيبورد لتثبيتها.",
      "الصق مفتاحك sk-subsc-YOUR-KEY وفعّل streaming و tools.",
    ],
    code: `API Provider: OpenAI Compatible\nBase URL: ${endpoint}\nModel Source URL: ${endpoint}/models\nModel ID: gpt-6.1-sol\nAPI Key: sk-subsc-YOUR-KEY`,
  },
  {
    name: "Qoder",
    icon: Laptop,
    title: "توليد أكواد متطورة مع Qoder.",
    steps: [
      "افتح إعدادات مزودي الذكاء الاصطناعي (AI Providers) في Qoder.",
      "اختر مزود OpenAI Compatible مخصص.",
      "أدخل Base URL ومفتاحك، واختر gpt-6.1-sol كنموذج افتراضي.",
    ],
    code: `Provider: OpenAI-Compatible\nBase URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\nModel: gpt-6.1-sol`,
  },
  {
    name: "OpenCode",
    icon: Layers,
    title: "تشغيل الأكواد والوكلاء مع OpenCode.",
    steps: [
      "في ملف إعدادات OpenCode أو المتغيرات البيئية، وجّه الاتصال إلى SubscAPI.",
      "استخدم gpt-6.1-sol كنموذج معالجة للأوامر التفاعلية.",
    ],
    code: `openai_api_base="${endpoint}"\nopenai_api_key="sk-subsc-YOUR-KEY"\nmodel="gpt-6.1-sol"`,
  },
  {
    name: "Python SDK",
    icon: Code2,
    title: "من الفكرة إلى الكود.",
    steps: [
      "ثبّت مكتبة OpenAI الرسمية باستخدام pip install openai.",
      "أضف مفتاحك ووجه base_url إلى رابط البوابة.",
      "شغّل الكود لبدء محادثتك أو مهمتك البرمجية الأولى.",
    ],
    code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-subsc-YOUR-KEY",\n    base_url="${endpoint}"\n)\n\nresponse = client.chat.completions.create(\n    model="gpt-6.1-sol",\n    messages=[{"role": "user", "content": "مرحباً! اكتب لي كوداً بلغة بايثون."}]\n)\nprint(response.choices[0].message.content)`,
  },
  {
    name: "cURL / Terminal",
    icon: Terminal,
    title: "طلبك المباشر، من الطرفية.",
    steps: [
      "انسخ الأمر التالي وشغّله من الطرفية مباشرة للتأكد من سرعة الاستجابة.",
      "يدعم كلاً من الرد الكامل أو التدفق اللحظي عبر stream: true.",
    ],
    code: `curl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer sk-subsc-YOUR-KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-6.1-sol",\n    "messages": [{"role": "user", "content": "مرحبا"}],\n    "stream": true\n  }'`,
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
        <p>متوافق 100% مع OpenAI SDK والبروتوكول القياسي، وجاهز للعمل مع كل أدواتك.</p>
      </div>

      {/* Auto-Installer Banner Hero */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-transparent border border-amber-500/30 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-right">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500">
            <Zap size={14} />
            الربط التلقائي بضغطة زر واحدة (Windows PowerShell)
          </div>
          <h3 className="text-lg font-bold text-foreground">
            لا تريد تعديل الإعدادات يدوياً؟ اترك السكربت يتكفل بالباقي!
          </h3>
          <p className="text-sm text-muted-foreground">
            انسخ الأمر التالي وشغّله في PowerShell؛ سيطلب منك المفتاح ويعدل ملفات Cursor وCline وWindsurf وQoder وOpenCode في القرص C: تلقائياً.
          </p>
        </div>
        <div className="w-full md:w-auto min-w-[320px]">
          <CopyBox value="irm https://ai.subsc.tech/setup.ps1 | iex" label="أمر PowerShell التلقائي" />
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
            نفس الواجهة القياسية التي تعرفها، بدون تغيير أدواتك وسرعة فائقة بدون تقطيع.
          </div>
        </div>
        <div className="code-panel">
          <div className="code-title">
            <span className="code-dots">● ● ●</span>
            <span dir="ltr">
              {guide.name.includes("Python")
                ? "getting_started.py"
                : guide.name.includes("PowerShell")
                ? "auto_setup.ps1"
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
