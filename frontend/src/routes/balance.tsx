import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  Wallet,
  Gauge,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, metadata } from "@/lib/subsc";
export const Route = createFileRoute("/balance")({
  head: () =>
    metadata("فحص الرصيد والاستهلاك", "تابع الرصيد المتبقي واستهلاك مفتاح SubscAPI الخاص بك."),
  component: Balance,
});
type BalanceData = {
  remainingBalance?: number;
  remaining?: number;
  totalLimit?: number;
  limit?: number;
  used: number;
  totalRequests?: number;
  percentage: number;
  status: string;
};
function Balance() {
  const [result, setResult] = useState<BalanceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const data = new FormData(e.currentTarget);
    try {
      setResult(
        await api<BalanceData>("/api/client/check-key", {
          method: "POST",
          data: { clientKey: data.get("key") },
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر فحص المفتاح");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="utility-page">
      <div className="section-heading">
        <div className="section-kicker">
          <Activity size={15} />
          كل شيء تحت سيطرتك
        </div>
        <h1>
          رصيدك، <span>في لمحة.</span>
        </h1>
        <p>تابع استخدامك واعرف الرصيد المتبقي من مفتاحك.</p>
      </div>
      <form className="balance-search" onSubmit={check}>
        <KeyRound />
        <input
          name="key"
          dir="ltr"
          placeholder="sk-subsc-..."
          aria-label="مفتاح API"
          required
          pattern="sk-subsc-.+"
        />
        <Button variant="premium" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="animate-spin" /> : <Activity />}فحص الرصيد
          <ArrowLeft />
        </Button>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {result ? (
        <>
          <div className="metrics-grid">
            {[
              {
                icon: Wallet,
                name: "الرصيد المتبقي",
                value: result.remainingBalance ?? result.remaining ?? 0,
              },
              {
                icon: ShieldCheck,
                name: "إجمالي الحصة",
                value: result.totalLimit ?? result.limit ?? 0,
              },
              { icon: Gauge, name: "المبلغ المستهلك", value: result.used },
            ].map((metric) => (
              <article className="metric-card" key={metric.name}>
                <metric.icon />
                <p>{metric.name}</p>
                <strong dir="ltr">${metric.value.toFixed(2)}</strong>
              </article>
            ))}
          </div>
          <div className="usage-section">
            <div>
              <h2>استهلاك الباقة</h2>
              <span>
                {result.totalRequests ?? 0} طلب ·{" "}
                {result.status === "active" ? "المفتاح نشط" : "المفتاح معلّق"}
              </span>
            </div>
            <progress max="100" value={Math.min(100, Math.max(0, result.percentage))} />
            <span dir="ltr">{result.percentage.toFixed(1)}% used</span>
          </div>
        </>
      ) : (
        <div className="balance-empty">
          <span className="empty-icon">
            <Wallet size={35} />
          </span>
          <h2>كل طلب محسوب. كل رصيد واضح.</h2>
          <p>أدخل مفتاحك لعرض الرصيد والاستهلاك الفعلي.</p>
          <span className="secure-note">
            <ShieldCheck size={14} />
            لن نشارك مفتاحك مع أي طرف آخر
          </span>
        </div>
      )}
    </section>
  );
}
