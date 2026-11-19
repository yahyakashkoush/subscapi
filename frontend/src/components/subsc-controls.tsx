import { useState, type FormEvent } from "react";
import { Copy, Check, ArrowLeft, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, price, type packages } from "@/lib/subsc";
import { useCurrency } from "./subsc-shell";
export function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("تم النسخ بنجاح");
      navigator.vibrate?.(20);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذر النسخ، يمكنك نسخ النص يدوياً");
    }
  }
  return (
    <div className="copy-wrap">
      {label && <span className="field-label">{label}</span>}
      <div className="copy-box" dir="ltr">
        <code>{value}</code>
        <Button
          size="icon"
          variant="ghost"
          onClick={copy}
          aria-label={`نسخ ${label || "الكود"}`}
          title="نسخ"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
export function Checkout({
  selected,
  close,
}: {
  selected: (typeof packages)[number] | null;
  close: () => void;
}) {
  const { currency } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<{ clientKey: string; baseUrl: string } | null>(null);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ clientKey: string; baseUrl: string }>("/api/subscribe", {
        method: "POST",
        data: {
          packageId: selected.id,
          customerName: data.get("name"),
          customerContact: data.get("contact"),
        },
      });
      if (!result.clientKey || !result.baseUrl) throw new Error("لم يصل مفتاح صالح من الخدمة");
      setDelivery(result);
      toast.success("تم تفعيل مفتاحك");
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر إتمام الطلب");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) {
          close();
          setDelivery(null);
          setError("");
        }
      }}
    >
      <DialogContent className="checkout-modal" dir="rtl">
        <span className="modal-symbol">
          <KeyRound />
        </span>
        <DialogTitle>
          {delivery ? "مفتاحك جاهز. ابدأ البناء!" : "خطوتك الأولى نحو إمكانيات أكبر"}
        </DialogTitle>
        <DialogDescription>
          {delivery
            ? "احتفظ بمفتاحك في مكان آمن."
            : "أدخل بياناتك لتفعيل الباقة واستلام مفتاحك الخاص."}
        </DialogDescription>
        {delivery ? (
          <>
            <CopyBox label="مفتاح API" value={delivery.clientKey} />
            <CopyBox label="Base URL" value={delivery.baseUrl} />
            <Button variant="premium" asChild>
              <Link to="/guide" onClick={close}>
                ربط المفتاح بأدواتك
                <ArrowLeft />
              </Link>
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className="checkout-form">
            <div className="order-summary">
              <span>{selected?.name}</span>
              <strong dir="ltr">
                {selected ? price(selected.amount, currency) : ""}{" "}
                {currency === "USD" ? "$" : "ج.م"}
              </strong>
            </div>
            <label>
              الاسم الكامل
              <input name="name" required placeholder="اسمك الكريم" autoComplete="name" />
            </label>
            <label>
              البريد الإلكتروني أو حساب تيليجرام
              <input name="contact" required placeholder="you@example.com / @username" dir="ltr" />
            </label>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <Button type="submit" variant="premium" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
              {busy ? "جارٍ الاتصال بالخدمة..." : "تفعيل واستلام المفتاح فوراً"}
              <ArrowLeft />
            </Button>
            <p className="form-security">
              <ShieldCheck size={14} /> بياناتك آمنة ومشفّرة
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
