import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Terminal, Box, Check, ArrowUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyBox } from "@/components/subsc-controls";
import { apiBase, metadata } from "@/lib/subsc";
export const Route = createFileRoute("/guide")({
  head: () =>
    metadata(
      "دليل الربط للمطورين",
      "اربط مفتاح SubscAPI مع Cursor وCline وPython عبر واجهة OpenAI المتوافقة.",
    ),
  component: Guide,
});
const endpoint = `${apiBase}/v1`;
const guides = [
  {
    name: "Cursor / Windsurf",
    icon: Box,
    title: "أدواتك المفضلة. قوة إضافية.",
    steps: [
      "افتح إعدادات التطبيق ثم انتقل إلى Models أو AI Providers.",
      "فعّل Override OpenAI Base URL وأدخل رابط الخدمة.",
      "أضف مفتاح SubscAPI، ثم اختر النموذج.",
    ],
    code: `Base URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\nModel: gpt-6.1-sol`,
  },
  {
    name: "Cline / Roo Code",
    icon: Code2,
    title: "وكيلك الذكي، متصل وجاهز.",
    steps: [
      "افتح إعدادات Cline أو Roo Code.",
      "اختر OpenAI Compatible من قائمة API Provider.",
      "أدخل Base URL ومفتاح API واسم النموذج.",
    ],
    code: `API Provider: OpenAI Compatible\nBase URL: ${endpoint}\nAPI Key: sk-subsc-YOUR-KEY\nModel ID: gpt-6.1-sol`,
  },
  {
    name: "Python",
    icon: Code2,
    title: "من الفكرة إلى الكود.",
    steps: [
      "ثبّت مكتبة OpenAI باستخدام pip install openai.",
      "أضف مفتاحك إلى متغير البيئة SUBSC_API_KEY.",
      "شغّل الكود لبدء محادثتك الأولى.",
    ],
    code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["SUBSC_API_KEY"],\n    base_url="${endpoint}"\n)\n\nresponse = client.chat.completions.create(\n    model="gpt-6.1-sol",\n    messages=[{"role": "user", "content": "Hello!"}]\n)\nprint(response.choices[0].message.content)`,
  },
  {
    name: "cURL",
    icon: Terminal,
    title: "طلبك الأول، من الطرفية.",
    steps: [
      "أضف مفتاحك إلى متغير البيئة SUBSC_API_KEY.",
      "انسخ الأمر التالي وشغّله من الطرفية.",
      "ستظهر استجابة النموذج مباشرة بصيغة JSON.",
    ],
    code: `curl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer $SUBSC_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-6.1-sol",\n    "messages": [{"role": "user", "content": "Hello!"}]\n  }'`,
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
          صُمم للمطورين
        </div>
        <h1>
          اربط مرة. <span>وابنِ بلا حدود.</span>
        </h1>
        <p>متوافق مع OpenAI SDK، وجاهز للعمل مع أدواتك المفضلة.</p>
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
            نفس الواجهة التي تعرفها، بدون تغيير أدواتك.
          </div>
        </div>
        <div className="code-panel">
          <div className="code-title">
            <span className="code-dots">● ● ●</span>
            <span dir="ltr">
              {guide.name === "Python" ? "getting_started.py" : "connection.config"}
            </span>
            <Terminal size={15} />
          </div>
          <CopyBox value={guide.code} label="مثال الربط" />
        </div>
      </div>
      <div className="endpoint-row">
        <div>
          <span className="section-kicker">عنوان الخدمة</span>
          <h3>نقطة اتصال واحدة لكل أدواتك</h3>
        </div>
        <CopyBox value={endpoint} label="Base URL" />
      </div>
      {apiBase.includes("localhost") && (
        <p className="service-note">
          عنوان الخدمة الحالي محلي؛ يلزم ربط عنوان عام قبل الاستخدام الفعلي.
        </p>
      )}
      <Button variant="link" asChild>
        <a href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noreferrer">
          مرجع OpenAI API
          <ArrowUpLeft />
        </a>
      </Button>
    </section>
  );
}
