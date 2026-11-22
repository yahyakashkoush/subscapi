import { useState, useEffect, type FormEvent } from "react";
import {
  Copy,
  Check,
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Coins,
  Send,
  Sparkles,
  LogIn,
  Building2,
  Phone,
  Mail,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, price, type packages } from "@/lib/subsc";
import { useCurrency } from "./subsc-shell";
import { useAuth } from "@/lib/auth";

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

type PaymentMethod = "bybit" | "corporate";

export function Checkout({
  selected,
  close,
}: {
  selected: (typeof packages)[number] | null;
  close: () => void;
}) {
  const { currency } = useCurrency();
  const { isSignedIn, user, openAuthModal } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>("bybit");
  const [selectedModel, setSelectedModel] = useState<string>("GPT ASTRA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<{ clientKey: string; baseUrl: string } | null>(null);

  // Corporate Request State
  const [corpSubmitted, setCorpSubmitted] = useState(false);
  const [corpResult, setCorpResult] = useState<{ message: string; requestId?: string } | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [corpPhone, setCorpPhone] = useState("");
  const [corpEmail, setCorpEmail] = useState("");
  const [desiredQuota, setDesiredQuota] = useState<number>(selected?.amount || 500);
  const [corpNotes, setCorpNotes] = useState("");

  useEffect(() => {
    if (selected?.models && selected.models.length > 0 && selected.models[0]) {
      setSelectedModel(selected.models[0]);
    }
    if (selected?.amount) {
      setDesiredQuota(selected.amount);
    }
  }, [selected]);

  // Bybit state
  const [bybitChain, setBybitChain] = useState<"TRC20" | "BEP20" | "SOL">("TRC20");
  const [txId, setTxId] = useState("");

  // Deposit info from backend
  const [paymentInfo, setPaymentInfo] = useState<{
    egpRate: number;
    bybitAddresses: Record<string, { address: string; network: string }>;
  } | null>(null);

  useEffect(() => {
    if (selected) {
      api<{
        success: boolean;
        egpRate: number;
        bybitAddresses: Record<string, { address: string; network: string }>;
      }>("/api/payment/info")
        .then((data) => {
          if (data && data.success) {
            setPaymentInfo(data);
          }
        })
        .catch(() => {});
    }
  }, [selected]);

  // Handle Bybit Verification
  async function handleVerifyBybit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !txId.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        success: boolean;
        status: string;
        clientKey: string;
        baseUrl: string;
        message: string;
        error?: string;
      }>("/api/payment/bybit/verify", {
        method: "POST",
        data: {
          txId: txId.trim(),
          tier: selected.amount,
          model: selectedModel,
          userId: user?.id,
          clerkUserId: user?.id,
          customerName: user?.name,
          customerEmail: user?.email,
        },
      });

      if (res.success && res.clientKey) {
        setDelivery({ clientKey: res.clientKey, baseUrl: res.baseUrl || "https://ai.subsc.tech/v1" });
        toast.success(res.message || "تم التحقق الفوري وتفعيل اشتراكك بنجاح! 🚀");
      } else {
        throw new Error(res.error || "فشل التحقق من معاملة Bybit");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التحقق من المعاملة");
    } finally {
      setBusy(false);
    }
  }

  // Handle Corporate Request Submission (Zero upfront payment, Admin activates)
  async function handleCorporateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !corpPhone.trim()) {
      setError("يرجى إدخال اسم الشركة ورقم الهاتف أو الواتساب للتواصل");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ success: boolean; message: string; requestId?: string }>("/api/corporate/request", {
        method: "POST",
        data: {
          companyName: companyName.trim(),
          contactName: contactName.trim() || user?.name || "",
          phone: corpPhone.trim(),
          email: corpEmail.trim() || user?.email || "",
          packageId: selected?.id || "pkg_corporate",
          desiredQuota: desiredQuota || selected?.amount || 500,
          notes: corpNotes.trim(),
        },
      });

      if (res && res.success) {
        setCorpSubmitted(true);
        setCorpResult({ message: res.message, ...(res.requestId ? { requestId: res.requestId } : {}) });
        toast.success("تم إرسال طلب شركتكم بنجاح! 🏢");
      } else {
        throw new Error((res as { error?: string })?.error || "فشل إرسال طلب الشركة");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إرسال الطلب، يرجى المحاولة لاحقاً");
    } finally {
      setBusy(false);
    }
  }

  const egpAmount = selected ? selected.amount * (paymentInfo?.egpRate || 54) : 0;
  const currentBybitAddress =
    paymentInfo?.bybitAddresses?.[bybitChain]?.address ||
    (bybitChain === "TRC20"
      ? "TJFRGx8Jj9ohxyxh6tJYAcvMBEY7fwEdwP"
      : "0xf216f46778047d7f566d135c0abf50d6765586e7");

  return (
    <Dialog
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) {
          close();
          setDelivery(null);
          setCorpSubmitted(false);
          setCorpResult(null);
          setError("");
        }
      }}
    >
      <DialogContent className="checkout-modal max-w-xl" dir="rtl">
        <span className="modal-symbol">
          <KeyRound />
        </span>

        {/* Header */}
        <DialogTitle>
          {delivery
            ? "مفتاحك جاهز. ابدأ البناء! 🚀"
            : corpSubmitted
            ? "تم استلام طلب تفعيل شركتكم بنجاح 🏢"
            : !isSignedIn
            ? "تسجيل الدخول مطلوب"
            : `تفعيل ${selected?.name}`}
        </DialogTitle>

        <DialogDescription>
          {delivery
            ? "تم تفعيل اشتراكك وتوليد مفتاح SubscAPI الخاص بك بنجاح. احتفظ به في مكان آمن."
            : corpSubmitted
            ? (corpResult?.message || "سيقوم فريق الدعم الفني بمطابقة بياناتكم وتفعيل المفتاح المخصص فوراً.")
            : !isSignedIn
            ? "يرجى تسجيل الدخول أو إنشاء حساب لربط مفتاح الـ API الخاص بك وحفظ حصتك."
            : "اختر وسيلة الدفع بالكريبتو أو التفعيل المباشر للشركات والمؤسسات بدون دفع مسبق."}
        </DialogDescription>

        {/* Delivery State (Success) */}
        {delivery ? (
          <div className="space-y-4 my-2">
            <CopyBox label="مفتاح الـ API الخاص بك" value={delivery.clientKey} />
            <CopyBox label="رابط الخادم (Base URL)" value={delivery.baseUrl} />
            <div className="pt-2 flex flex-col gap-2">
              <Button variant="premium" asChild>
                <Link to="/dashboard" onClick={close}>
                  <Sparkles size={16} />
                  انتقل إلى لوحة حسابك ومفاتيحك
                  <ArrowLeft size={16} />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/guide" onClick={close}>
                  دليل ربط المفتاح مع Cursor و Cline
                </Link>
              </Button>
            </div>
          </div>
        ) : corpSubmitted ? (
          /* Corporate Request Success State */
          <div className="space-y-4 my-3 text-center">
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-100">
              <Building2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <h4 className="font-bold text-base mb-1">طلب تسجيل شركة: {companyName}</h4>
              <p className="text-xs text-muted-foreground mb-3 font-mono">
                رقم الطلب: {corpResult?.requestId || "CORP-PENDING"}
              </p>
              <p className="text-sm leading-relaxed">
                تم تسجيل طلبكم بنجاح بحصة <strong>{desiredQuota.toLocaleString()} استدعاء</strong>. 
                سيقوم مسؤول النظام بالتواصل معكم عبر الواتساب على رقم <strong>{corpPhone}</strong> لتفعيل المفتاح المباشر الخاص بشركتكم فوراً.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="premium" asChild>
                <a
                  href={`https://wa.me/201018671607?text=${encodeURIComponent(
                    `مرحباً SubscAPI، قمت بتقديم طلب شركة (${companyName}) برقم ${corpResult?.requestId || ""} وأود المتابعة لتفعيل المفتاح.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Send size={15} />
                  متابعة التفعيل فوراً عبر الواتساب ⚡
                </a>
              </Button>
              <Button variant="outline" onClick={close}>
                إغلاق
              </Button>
            </div>
          </div>
        ) : !isSignedIn ? (
          /* Sign-In Required */
          <div className="space-y-4 my-4 text-center">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-foreground">
                لحماية حسابك ورصيدك، يتم ربط كل مفتاح API بحساب موثق. التسجيل يستغرق ثوانٍ معدودة.
              </p>
            </div>
            <Button variant="premium" size="lg" className="w-full" onClick={() => openAuthModal("login")}>
              <LogIn size={16} />
              تسجيل الدخول أو حساب جديد للمتابعة
            </Button>
          </div>
        ) : (
          /* Payment Methods Selection */
          <div className="space-y-4">
            {/* Order Price Summary */}
            <div className="order-summary flex items-center justify-between p-3 rounded-xl bg-card border border-border">
              <div className="text-right">
                <div className="font-bold">{selected?.name}</div>
                <div className="text-xs text-muted-foreground">رصيد استخدام ${selected?.amount}</div>
              </div>
              <div className="text-left font-mono">
                <div className="text-lg font-bold text-primary" dir="ltr">
                  ${selected?.amount} USD
                </div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  ≈ {egpAmount.toLocaleString()} EGP
                </div>
              </div>
            </div>

            {/* Model Selection (Choice of Model within the package) */}
            <div className="p-3 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Sparkles size={14} className="text-primary" />
                  اختر النموذج المطلوب (AI Model):
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  مفتاح حصري للنموذج المختار
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(selected?.models || ["GPT ASTRA", "gpt-6.1-sol"]).map((model) => {
                  const isChosen = selectedModel === model;
                  const modelStock = selected?.modelDetails?.find((m) => m.name === model)?.stockCount;
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setSelectedModel(model)}
                      className={`p-2.5 rounded-lg border text-right transition-all flex flex-col justify-between ${
                        isChosen
                          ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                          : "border-border hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-xs font-bold">{model}</span>
                        {isChosen && <Check size={14} className="text-primary" />}
                      </div>
                      <span className="text-[10px] mt-1 text-muted-foreground font-sans">
                        {modelStock !== undefined ? `متوفر في المخزن (${modelStock})` : "متوفر وجاهز للتفعيل ⚡"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment & Activation Method Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("bybit")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  method === "bybit"
                    ? "border-primary bg-primary/10 font-bold text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border hover:bg-accent text-muted-foreground"
                }`}
              >
                <Coins className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                <div className="text-xs font-bold">تحويل فوري Bybit USDT</div>
                <div className="text-[10px] opacity-75">تفعيل أوتوماتيكي فوري ⚡</div>
              </button>

              <button
                type="button"
                onClick={() => setMethod("corporate")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  method === "corporate"
                    ? "border-primary bg-primary/10 font-bold text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border hover:bg-accent text-muted-foreground"
                }`}
              >
                <Building2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                <div className="text-xs font-bold">طلب شركات ومؤسسات</div>
                <div className="text-[10px] opacity-75">بدون دفع مسبق / تفعيل فوري 🏢</div>
              </button>
            </div>

            {/* TAB 1: BYBIT USDT DEPOSIT */}
            {method === "bybit" && (
              <form onSubmit={handleVerifyBybit} className="space-y-3 p-4 rounded-xl border border-border bg-card/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>اختر شبكة التحويل (Bybit USDT):</span>
                  <div className="flex gap-1" dir="ltr">
                    {(["TRC20", "BEP20", "SOL"] as const).map((ch) => (
                      <button
                        type="button"
                        key={ch}
                        onClick={() => setBybitChain(ch)}
                        className={`px-2 py-0.5 rounded text-xs border ${
                          bybitChain === ch
                            ? "bg-primary text-primary-foreground border-primary font-bold"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs">
                  المبلغ المطلوب إيداعه:{" "}
                  <strong className="text-yellow-500 font-mono text-sm">${selected?.amount} USDT</strong>
                </div>

                <CopyBox label={`عنوان إيداع Bybit (${bybitChain})`} value={currentBybitAddress} />

                <label className="block text-xs font-medium">
                  معرف المعاملة (TxID / Transaction Hash)
                  <input
                    value={txId}
                    onChange={(e) => setTxId(e.target.value)}
                    required
                    placeholder="الصق كود الـ TxID أو Hash للعملية هنا..."
                    dir="ltr"
                    className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm font-mono"
                  />
                </label>

                <Button type="submit" variant="premium" className="w-full" disabled={busy || !txId.trim()}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Coins size={16} />}
                  {busy ? "جارٍ التحقق التلقائي عبر Bybit API..." : "تحقق عبر Bybit وتفعيل المفتاح فوراً ⚡"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  * يتم فحص المعاملة مباشرة مع سيرفرات Bybit، ويتفعل المفتاح تلقائياً بمجرد تأكيد البلوكتشين.
                </p>
              </form>
            )}

            {/* TAB 2: CORPORATE REQUEST (ZERO ADVANCE PAYMENT) */}
            {method === "corporate" && (
              <form onSubmit={handleCorporateSubmit} className="space-y-3 p-4 rounded-xl border border-border bg-card/50">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Building2 size={15} />
                    نظام تفعيل الشركات والمشاريع الكبرى:
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    لا يتطلب أي دفع مسبق الآن. قم بملء بيانات شركتك وحصتك المطلوبة، وسيقوم مسؤول النظام باعتماد حسابك وتوليد مفتاح الـ API المخصص لكم فوراً والتواصل معكم عبر الواتساب.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>
                    اسم الشركة / المؤسسة *
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                      placeholder="مثال: شركة آفاق البرمجية"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                    />
                  </label>
                  <label>
                    اسم مسؤول التواصل
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="اسم المهندس أو المدير"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>
                    رقم الواتساب / الهاتف للتفعيل *
                    <input
                      value={corpPhone}
                      onChange={(e) => setCorpPhone(e.target.value)}
                      required
                      placeholder="+201..."
                      dir="ltr"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs font-mono"
                    />
                  </label>
                  <label>
                    البريد الإلكتروني للعمل
                    <input
                      value={corpEmail}
                      onChange={(e) => setCorpEmail(e.target.value)}
                      placeholder="info@company.com"
                      dir="ltr"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                    />
                  </label>
                </div>

                <label className="block text-xs font-medium">
                  الكمية / الحصة المطلوبة (عدد الاستدعاءات أو رصيد الباقة)
                  <input
                    type="number"
                    value={desiredQuota}
                    onChange={(e) => setDesiredQuota(Number(e.target.value))}
                    min={50}
                    step={50}
                    className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs font-mono"
                  />
                </label>

                <label className="block text-xs font-medium">
                  ملاحظات أو طبيعة استخدام الفريق (اختياري)
                  <input
                    value={corpNotes}
                    onChange={(e) => setCorpNotes(e.target.value)}
                    placeholder="مثال: نريد ربطه مع Cursor أو Cline لفريق عمل مكون من 5 مطورين..."
                    className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                  />
                </label>

                <Button type="submit" variant="premium" className="w-full" disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Building2 size={16} />}
                  {busy ? "جارٍ إرسال الطلب للأدمن..." : "تقديم طلب التفعيل للشركات (بدون دفع مسبق) 🏢"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  * يتم إشعار إدارة النظام فورياً لاعتماد المفتاح والتواصل معكم لتسليم بيانات الربط.
                </p>
              </form>
            )}

            {error && (
              <p role="alert" className="error-message text-xs text-red-500 bg-red-500/10 p-2 rounded-lg">
                {error}
              </p>
            )}

            <p className="form-security text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
              <ShieldCheck size={14} className="text-emerald-500" /> اتصال آمن ومحمي 100%
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
