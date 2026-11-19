import { useState, useEffect, type FormEvent } from "react";
import {
  Copy,
  Check,
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  Coins,
  Send,
  Clock,
  ExternalLink,
  RefreshCw,
  Sparkles,
  LogIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, price, type packages } from "@/lib/subsc";
import { useCurrency } from "./subsc-shell";
import { useUser, SignInButton } from "@clerk/clerk-react";

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

type PaymentMethod = "vodafone" | "bybit" | "instapay";

export function Checkout({
  selected,
  close,
}: {
  selected: (typeof packages)[number] | null;
  close: () => void;
}) {
  const { currency } = useCurrency();
  const { isSignedIn, user } = useUser();
  const [method, setMethod] = useState<PaymentMethod>("vodafone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<{ clientKey: string; baseUrl: string } | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; message: string } | null>(null);

  // Vodafone Cash state
  const [vfLink, setVfLink] = useState<{ paymentUrl: string; orderId: string } | null>(null);
  const [checkingVf, setCheckingVf] = useState(false);

  // Bybit state
  const [bybitChain, setBybitChain] = useState<"TRC20" | "BEP20" | "SOL">("TRC20");
  const [txId, setTxId] = useState("");

  // InstaPay state
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [instaRef, setInstaRef] = useState("");

  // Deposit info from backend
  const [paymentInfo, setPaymentInfo] = useState<{
    egpRate: number;
    instapay: { name: string; username: string; phone: string };
    bybitAddresses: Record<string, { address: string; network: string }>;
  } | null>(null);

  useEffect(() => {
    if (selected) {
      api<{
        success: boolean;
        egpRate: number;
        instapay: { name: string; username: string; phone: string };
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

  // Handle Vodafone Cash Link Generation
  async function handleCreateVodafoneLink() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ success: boolean; paymentUrl: string; orderId: string; amountEGP: number }>(
        "/api/payment/vodafone/create",
        {
          method: "POST",
          data: {
            tier: selected.amount,
            customerName: user?.fullName || user?.username || "عميل فودافون كاش",
            customerEmail: user?.primaryEmailAddress?.emailAddress,
            clerkUserId: user?.id,
          },
        }
      );
      if (res && res.paymentUrl) {
        setVfLink({ paymentUrl: res.paymentUrl, orderId: res.orderId });
        window.open(res.paymentUrl, "_blank");
        toast.success("تم توليد رابط الدفع، جارٍ فتحه الآن");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء رابط دفع فودافون كاش");
    } finally {
      setBusy(false);
    }
  }

  // Check Vodafone Cash status
  async function handleCheckVodafone() {
    if (!vfLink) return;
    setCheckingVf(true);
    setError("");
    try {
      const res = await api<{
        success: boolean;
        status: string;
        clientKey?: string;
        baseUrl?: string;
        message?: string;
      }>(`/api/payment/vodafone/check/${vfLink.orderId}`);

      if (res.status === "completed" && res.clientKey) {
        setDelivery({ clientKey: res.clientKey, baseUrl: res.baseUrl || "https://ai.subsc.tech/v1" });
        toast.success("تم تأكيد الدفع وتفعيل المفتاح بنجاح! 🚀");
      } else {
        toast.info(res.message || "الدفع ما زال معلقاً، يرجى إتمام السحب على هاتفك أولاً");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التحقق من الدفع");
    } finally {
      setCheckingVf(false);
    }
  }

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
          clerkUserId: user?.id,
          customerName: user?.fullName || user?.username,
          customerEmail: user?.primaryEmailAddress?.emailAddress,
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

  // Handle InstaPay Submission (Pending Approval)
  async function handleInstapaySubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ success: boolean; status: string; orderId: string; message: string }>(
        "/api/payment/instapay/submit",
        {
          method: "POST",
          data: {
            tier: selected.amount,
            clerkUserId: user?.id,
            customerName: user?.fullName || user?.username || senderName,
            customerEmail: user?.primaryEmailAddress?.emailAddress,
            senderName,
            senderPhone,
            transactionRef: instaRef,
          },
        }
      );

      if (res.success) {
        setPendingOrder({ id: res.orderId, message: res.message });
        toast.success("تم إرسال الطلب بنجاح، وهو قيد المراجعة والانتظار");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال الطلب");
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
          setPendingOrder(null);
          setVfLink(null);
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
            : pendingOrder
            ? "طلبك قيد المراجعة والانتظار ⏳"
            : !isSignedIn
            ? "تسجيل الدخول مطلوب"
            : `تفعيل ${selected?.name}`}
        </DialogTitle>

        <DialogDescription>
          {delivery
            ? "تم تفعيل اشتراكك وتوليد مفتاح SubscAPI الخاص بك بنجاح. احتفظ به في مكان آمن."
            : pendingOrder
            ? pendingOrder.message
            : !isSignedIn
            ? "يرجى تسجيل الدخول أو إنشاء حساب لربط مفتاح الـ API الخاص بك وحفظ حصتك."
            : "اختر وسيلة الدفع المناسبة لإتمام التفعيل واستلام مفتاحك."}
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
        ) : pendingOrder ? (
          /* Pending Approval State */
          <div className="space-y-4 my-3 text-center">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
              <Clock className="w-8 h-8 mx-auto mb-2 text-amber-500 animate-pulse" />
              <h4 className="font-bold text-base mb-1">رقم الطلب: {pendingOrder.id}</h4>
              <p className="text-sm opacity-90">
                تم تسجيل طلبك لتحويل انستاباي/اليدوي بمبلغ{" "}
                <strong>{egpAmount.toLocaleString()} ج.م</strong>. سيقوم الأدمن بمطابقة التحويل وتفعيل
                المفتاح في حسابك مباشرة.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="premium" asChild>
                <Link to="/dashboard" onClick={close}>
                  متابعة حالة الطلب في حسابي
                  <ArrowLeft size={16} />
                </Link>
              </Button>
              <Button variant="glass" asChild>
                <a href="https://t.me/subscnow" target="_blank" rel="noreferrer">
                  <Send size={15} />
                  إرسال صورة التحويل عبر تيليجرام
                </a>
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
            <SignInButton mode="modal">
              <Button variant="premium" size="lg" className="w-full">
                <LogIn size={16} />
                تسجيل الدخول أو حساب جديد للمتابعة
              </Button>
            </SignInButton>
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

            {/* Payment Method Tabs */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod("vodafone")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  method === "vodafone"
                    ? "border-primary bg-primary/10 font-bold text-primary shadow-sm"
                    : "border-border hover:bg-accent text-muted-foreground"
                }`}
              >
                <Smartphone className="w-5 h-5 mx-auto mb-1 text-red-500" />
                <div className="text-xs">فودافون كاش</div>
                <div className="text-[10px] opacity-75">دفع إلكتروني فوري</div>
              </button>

              <button
                type="button"
                onClick={() => setMethod("bybit")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  method === "bybit"
                    ? "border-primary bg-primary/10 font-bold text-primary shadow-sm"
                    : "border-border hover:bg-accent text-muted-foreground"
                }`}
              >
                <Coins className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                <div className="text-xs">تحويل Bybit</div>
                <div className="text-[10px] opacity-75">USDT Onchain</div>
              </button>

              <button
                type="button"
                onClick={() => setMethod("instapay")}
                className={`p-3 rounded-xl border text-center transition-all ${
                  method === "instapay"
                    ? "border-primary bg-primary/10 font-bold text-primary shadow-sm"
                    : "border-border hover:bg-accent text-muted-foreground"
                }`}
              >
                <Clock className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                <div className="text-xs">انستاباي / يدوي</div>
                <div className="text-[10px] opacity-75">مراجعة الأدمن</div>
              </button>
            </div>

            {/* TAB 1: VODAFONE CASH (SHA7NAWY GATEWAY) */}
            {method === "vodafone" && (
              <div className="space-y-3 p-4 rounded-xl border border-border bg-card/50">
                <div className="flex items-center justify-between text-sm">
                  <span>المبلغ المطلوب بالمصري:</span>
                  <strong className="text-primary font-mono text-base">
                    {egpAmount.toLocaleString()} ج.م
                  </strong>
                </div>

                {!vfLink ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      سيتم إنشاء رابط دفع رسمي عبر بوابة فودافون كاش ومحافظ مصر المعتمدة. بعد إتمام
                      السحب، سيتم تفعيل المفتاح تلقائياً.
                    </p>
                    <Button
                      type="button"
                      variant="premium"
                      className="w-full"
                      onClick={handleCreateVodafoneLink}
                      disabled={busy}
                    >
                      {busy ? <LoaderCircle className="animate-spin" /> : <Smartphone size={16} />}
                      {busy ? "جارٍ تجهيز بوابة الدفع..." : "الدفع عبر فودافون كاش ↗️"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="p-3 rounded-lg bg-primary/10 text-xs text-center border border-primary/20">
                      تم إنشاء رابط الدفع بنجاح. إذا لم تفتح نافذة الدفع تلقائياً:
                    </div>
                    <Button variant="default" className="w-full" asChild>
                      <a href={vfLink.paymentUrl} target="_blank" rel="noreferrer">
                        فتح رابط دفع فودافون كاش الآن <ExternalLink size={15} />
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleCheckVodafone}
                      disabled={checkingVf}
                    >
                      {checkingVf ? <LoaderCircle className="animate-spin" /> : <RefreshCw size={15} />}
                      {checkingVf ? "جارٍ التحقق من السحب..." : "تحقق من حالة الدفع وتفعيل المفتاح 🔄"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BYBIT USDT DEPOSIT */}
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

            {/* TAB 3: INSTAPAY / MANUAL (WAITING LIST) */}
            {method === "instapay" && (
              <form onSubmit={handleInstapaySubmit} className="space-y-3 p-4 rounded-xl border border-border bg-card/50">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                    بيانات تحويل انستاباي:
                  </div>
                  <div>
                    الحساب / الرقم:{" "}
                    <strong className="font-mono text-foreground">
                      {paymentInfo?.instapay.username || "subscapi@instapay"}
                    </strong>
                  </div>
                  <div>
                    المبلغ المطلوب:{" "}
                    <strong className="font-mono text-foreground">
                      {egpAmount.toLocaleString()} ج.م
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>
                    اسم صاحب الحساب المحول
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      required
                      placeholder="الاسم كما يظهر في التطبيق"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                    />
                  </label>
                  <label>
                    رقم الهاتف أو عنوان انستاباي
                    <input
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      required
                      placeholder="010... أو name@instapay"
                      dir="ltr"
                      className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs"
                    />
                  </label>
                </div>

                <label className="block text-xs font-medium">
                  الرقم المرجعي للتحويل (Reference No / TxID)
                  <input
                    value={instaRef}
                    onChange={(e) => setInstaRef(e.target.value)}
                    required
                    placeholder="مثال: 59384729103"
                    dir="ltr"
                    className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-xs font-mono"
                  />
                </label>

                <Button type="submit" variant="premium" className="w-full" disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Clock size={16} />}
                  {busy ? "جارٍ إرسال الطلب..." : "إرسال الطلب لمراجعة الأدمن ⏳"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  * يظل حسابك في وضع الانتظار حتى يتأكد الأدمن من وصول المبلغ، ثم يتم إصدار مفتاحك تلقائياً.
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
