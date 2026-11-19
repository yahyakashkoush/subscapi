import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpLeft,
  Zap,
  ShieldCheck,
  Network,
  Check,
  Code2,
  Building2,
  KeyRound,
  Terminal,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/components/subsc-shell";
import { Checkout } from "@/components/subsc-controls";
import { packages, price, metadata, api } from "@/lib/subsc";
import robot from "@/assets/subsc-robot-original-transparent.png.asset.json";
export const Route = createFileRoute("/")({
  head: () =>
    metadata(
      "باقات الذكاء الاصطناعي",
      "باقات SubscAPI للمطورين والفرق، بمفتاح واحد متوافق مع أدوات الذكاء الاصطناعي.",
    ),
  component: Index,
});
function Index() {
  const { currency } = useCurrency();
  const [selected, setSelected] = useState<(typeof packages)[number] | null>(null);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    api<
      | Array<{ id: string; stockCount?: number; stock?: number }>
      | { packages: Array<{ id: string; stockCount?: number; stock?: number }> }
    >("/api/packages")
      .then((data) => {
        const items = Array.isArray(data) ? data : data.packages;
        if (active && Array.isArray(items))
          setStocks(Object.fromEntries(items.map((p) => [p.id, p.stockCount ?? p.stock ?? 0])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <section className="hero-section">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">اشتراكات الذكاء الاصطناعي · للمطورين والفرق</div>
            <h1>
              اشتراكات API
              <br />
              للذكاء الاصطناعي.
              <br />
              مفتاح واحد،
              <br />
              لكل أدواتك.
            </h1>
            <p className="hero-description">
              اختَر باقتك واربط مفتاحك مباشرةً مع <bdi className="tool-name">Cursor</bdi>،{" "}
              <bdi className="tool-name">Cline</bdi>، <bdi className="tool-name">Claude Code</bdi>.
              رصيد واضح، وواجهة متوافقة مع OpenAI، ودعم يساعدك تبدأ.
            </p>
            <div className="hero-buttons">
              <Button
                variant="premium"
                size="lg"
                onClick={() =>
                  document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                استعرض الباقات
                <ArrowLeft />
              </Button>
              <Button variant="glass" size="lg" asChild>
                <Link to="/guide">
                  دليل الربط
                  <ArrowUpLeft />
                </Link>
              </Button>
            </div>
            <a
              className="hero-telegram"
              href="https://t.me/subscnow"
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpLeft size={14} /> أو تواصل معنا مباشرةً على تيليجرام
            </a>
            <div className="hero-trust">
              <span>
                <Zap />
                باقات تناسب استخدامك
              </span>
              <span>
                <ShieldCheck />
                رصيد استخدام كامل
              </span>
              <span>
                <Network />
                متوافق مع OpenAI
              </span>
            </div>
          </div>
          <div className="mascot-scene">
            <img
              className="hero-robot"
              src={robot.url}
              alt="روبوت SubscAPI الأبيض يلوح بيده مع عيون زرقاء مضيئة"
            />
          </div>
        </div>
      </section>
      <section className="tools-band">
        <div className="tools-inner">
          <span className="tools-caption">يعمل بانسجام مع أدواتك</span>
          <div className="tool-word">
            <Box />
            Cursor
          </div>
          <div className="tool-word">
            <Terminal />
            Cline
          </div>
          <div className="tool-word claude-word">
            <span>✳</span>Claude Code
          </div>
          <div className="tool-word">
            <Network />
            Windsurf
          </div>
          <div className="tool-word">
            <Code2 />
            OpenAI SDK
          </div>
          <span className="compatible-tag">
            <Check size={13} /> OpenAI Compatible
          </span>
        </div>
      </section>
      <section className="pricing-section" id="packages">
        <div className="section-heading">
          <div className="section-kicker">الباقات والأسعار</div>
          <h2>اختَر الباقة المناسبة لاستخدامك.</h2>
          <p>ثلاث باقات، ورصيد كامل لكل باقة. ادفع مرة واحدة واستخدمه مع أدواتك المفضلة.</p>
        </div>
        <div className="pricing-grid">
          {packages.map((pack, index) => {
            const Icon = index === 0 ? Code2 : index === 1 ? Zap : Building2;
            return (
              <article className={`price-card ${index === 1 ? "featured-card" : ""}`} key={pack.id}>
                {index === 1 && <span className="popular-tag">الأكثر طلباً</span>}
                <div className="plan-top">
                  <span className={`plan-icon plan-icon-${index}`}>
                    <Icon size={23} />
                  </span>
                  <span className="plan-english" dir="ltr">
                    {pack.english}
                  </span>
                </div>
                <h3>{pack.name}</h3>
                <p className="plan-description">{pack.description}</p>
                <div className="plan-price">
                  <strong>{price(pack.amount, currency)}</strong>
                  <span>{currency === "USD" ? "$" : "ج.م"}</span>
                  <small>دفعة واحدة</small>
                </div>
                <div className="quota-note">
                  <KeyRound size={14} />
                  رصيد استخدام كامل <b dir="ltr">${pack.amount}</b>
                </div>
                <div className="card-divider" />
                <ul>
                  {pack.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={index === 1 ? "premium" : "glass"}
                  className="plan-button"
                  onClick={() => setSelected(pack)}
                  disabled={stocks[pack.id] === 0}
                >
                  تفعيل واستلام المفتاح فوراً
                  <ArrowLeft size={15} />
                </Button>
                <div className="stock-label">
                  <span
                    className={
                      stocks[pack.id] !== undefined && (stocks[pack.id] ?? 0) > 0
                        ? "status-dot"
                        : "stock-dot"
                    }
                  />
                  {stocks[pack.id] === undefined
                    ? "يتم تأكيد التوفر عند التفعيل"
                    : (stocks[pack.id] ?? 0) > 0
                      ? `متوفر في المخزن · ${stocks[pack.id]} مفاتيح جاهزة`
                      : "نفدت المفاتيح حالياً"}
                </div>
              </article>
            );
          })}
        </div>
        <div className="pricing-footnote">
          <ShieldCheck size={16} />
          مفتاح خاص بك<span>·</span>لا رسوم خفية<span>·</span>رصيدك تحت سيطرتك
        </div>
      </section>
      <section className="connection-band">
        <div className="connection-inner">
          <div className="connection-icon">
            <Terminal />
          </div>
          <div>
            <h2>من المفتاح إلى أول سطر كود.</h2>
            <p>كل ما تحتاجه للبدء، مع أدواتك المفضلة.</p>
          </div>
          <Button variant="glass" asChild>
            <Link to="/guide">
              استعرض دليل الربط
              <ArrowUpLeft />
            </Link>
          </Button>
          <div className="connection-code" dir="ltr">
            <span>client</span> = OpenAI(api_key=<b>"sk-subsc-..."</b>)
          </div>
        </div>
      </section>
      <Checkout selected={selected} close={() => setSelected(null)} />
    </>
  );
}
