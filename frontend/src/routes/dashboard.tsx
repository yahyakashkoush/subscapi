import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  KeyRound,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  RefreshCw,
  Zap,
  Terminal,
  Box,
  Send,
  Eye,
  EyeOff,
  AlertCircle,
  ExternalLink,
  Code2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, metadata, packages } from "@/lib/subsc";
import { CopyBox, Checkout } from "@/components/subsc-controls";
import { useUser, SignInButton } from "@clerk/react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () =>
    metadata(
      "لوحة حسابي ومفاتيحي",
      "إدارة اشتراك SubscAPI ومفتاح الذكاء الاصطناعي ومتابعة الرصيد والاستهلاك."
    ),
  component: Dashboard,
});

type SubscriptionData = {
  tier: number;
  model?: string;
  clientKey: string;
  initialBalance: number;
  remainingBalance: number;
  usedBalance: number;
  percentageRemaining: number;
  paidVia: string;
  activatedAt: string;
  baseUrl: string;
};

type PendingOrder = {
  id: string;
  tier: number;
  type: string;
  createdAt: string;
  paymentUrl?: string;
};

function Dashboard() {
  const { isSignedIn, isLoaded, user } = useUser();
  const [loading, setLoading] = useState(true);
  const [subStatus, setSubStatus] = useState<"active" | "pending_approval" | "none">("none");
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency: number; message: string } | null>(null);
  const [selectedPack, setSelectedPack] = useState<(typeof packages)[number] | null>(null);

  async function fetchSubscription() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api<{
        success: boolean;
        status: "active" | "pending_approval" | "none";
        subscription?: SubscriptionData;
        pendingOrder?: PendingOrder;
      }>("/api/user/subscription", {
        headers: {
          "x-clerk-user-id": user.id,
          "x-clerk-user-email": user.primaryEmailAddress?.emailAddress || "",
        },
      });

      if (res && res.success) {
        setSubStatus(res.status);
        if (res.subscription) setSubData(res.subscription);
        if (res.pendingOrder) setPendingOrder(res.pendingOrder);
      }
    } catch (err) {
      console.error("Failed to load subscription:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      fetchSubscription();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, user]);

  // Live test of the client API key
  async function testConnection() {
    if (!subData?.clientKey) return;
    setTestingKey(true);
    setTestResult(null);
    const start = Date.now();
    try {
      const response = await fetch(`${subData.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${subData.clientKey}`,
        },
      });
      const latency = Date.now() - start;
      if (response.ok) {
        setTestResult({
          ok: true,
          latency,
          message: `الاتصال ناجح فائق السرعة! زمن الاستجابة: ${latency}ms عبر سيرفر البوابة المباشر.`,
        });
        toast.success("المفتاح يعمل بكفاءة 100%!");
      } else {
        const errJson = await response.json().catch(() => ({}));
        setTestResult({
          ok: false,
          latency,
          message: errJson?.error?.message || "تعذر التحقق من المفتاح",
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        latency: Date.now() - start,
        message: err instanceof Error ? err.message : "فشل فحص الاتصال",
      });
    } finally {
      setTestingKey(false);
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">جارٍ تحميل بيانات حسابك واشتراكك...</p>
      </div>
    );
  }

  // Signed Out View
  if (!isSignedIn) {
    return (
      <section className="dashboard-section py-12 px-4 max-w-lg mx-auto text-center">
        <div className="p-8 rounded-2xl bg-card border border-border shadow-lg space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound size={28} />
          </div>
          <h2 className="text-xl font-bold">تسجيل الدخول مطلوب</h2>
          <p className="text-sm text-muted-foreground">
            يرجى تسجيل الدخول أو إنشاء حساب للوصول إلى لوحة مفتاح الـ API الخاص بك ومتابعة استهلاكك.
          </p>
          <div className="pt-2">
            <SignInButton mode="modal">
              <Button variant="premium" size="lg" className="w-full">
                تسجيل الدخول / حساب جديد
              </Button>
            </SignInButton>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="dashboard-page max-w-4xl mx-auto py-8 px-4 space-y-6" dir="rtl">
      {/* Top Welcome Card */}
      <div className="user-header-card p-6 rounded-2xl bg-gradient-to-r from-card to-accent/30 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg ring-2 ring-primary/20">
            {user.firstName ? user.firstName[0] : "U"}
          </div>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              مرحباً، {user.fullName || user.username || "عزيزي المطور"}
              {subStatus === "active" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  مشترك نشط ✅
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground font-mono" dir="ltr">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={fetchSubscription} className="self-end sm:self-center">
          <RefreshCw size={14} />
          تحديث الحالة
        </Button>
      </div>

      {/* CASE 1: ACTIVE SUBSCRIPTION */}
      {subStatus === "active" && subData && (
        <div className="space-y-6">
          {/* Main Key Card */}
          <div className="p-6 rounded-2xl bg-card border border-primary/30 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    باقة {subData.tier}$ - SubscAPI Key
                  </span>
                  {subData.model && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      النموذج: {subData.model}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold mt-0.5">مفتاح الذكاء الاصطناعي المباشر</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                  className="text-xs text-muted-foreground"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
                </Button>
              </div>
            </div>

            {/* Key String Box */}
            <div className="space-y-3">
              <CopyBox
                label="مفتاح الـ API الخاص بك (Authorization Bearer)"
                value={showKey ? subData.clientKey : subData.clientKey.replace(/(.{12}).+(.{6})/, "$1••••••••••••••••$2")}
              />
              <CopyBox label="رابط الخادم المباشر (Base URL)" value={subData.baseUrl} />
            </div>

            {/* Live Balance Bar */}
            <div className="p-4 rounded-xl bg-background border border-border space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-muted-foreground">رصيد الاستخدام المتبقي:</span>
                <span className="font-bold font-mono text-primary text-base">
                  ${subData.remainingBalance.toFixed(2)} / ${subData.initialBalance.toFixed(2)} USD
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(2, subData.percentageRemaining))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>المستهلك: ${subData.usedBalance.toFixed(2)}</span>
                <span>المتبقي: {subData.percentageRemaining}%</span>
              </div>
            </div>

            {/* Live Key Test Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border">
              <Button
                variant="premium"
                size="sm"
                onClick={testConnection}
                disabled={testingKey}
                className="w-full sm:w-auto"
              >
                {testingKey ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
                {testingKey ? "جارٍ اختبار الاتصال بالسيرفر..." : "فحص الاتصال الحي بالمفتاح ⚡"}
              </Button>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck size={14} className="text-emerald-500" />
                متوافق مع gpt-6.1-sol وجميع نماذج OpenAI
              </div>
            </div>

            {/* Test Result Message */}
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.ok
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-600 border border-red-500/20"
                }`}
              >
                {testResult.ok ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Quick Integration Guides */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Code2 className="text-primary" size={18} />
              إعدادات الربط السريعة مع أدواتك:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono" dir="ltr">
              {/* Cursor Config */}
              <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                <div className="font-bold text-foreground font-sans flex items-center gap-1.5" dir="rtl">
                  <Box size={14} className="text-primary" />
                  إعدادات Cursor:
                </div>
                <pre className="p-2 rounded bg-muted/50 overflow-x-auto text-[11px] text-muted-foreground">
{`"openai.baseUrl": "${subData.baseUrl}",
"openai.apiKey": "${subData.clientKey}",
"model": "gpt-6.1-sol"`}
                </pre>
              </div>

              {/* Cline Config */}
              <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                <div className="font-bold text-foreground font-sans flex items-center gap-1.5" dir="rtl">
                  <Terminal size={14} className="text-primary" />
                  إعدادات Cline / Roo Code:
                </div>
                <pre className="p-2 rounded bg-muted/50 overflow-x-auto text-[11px] text-muted-foreground">
{`Provider: OpenAI Compatible
Base URL: ${subData.baseUrl}
API Key:  ${subData.clientKey}
Model ID: gpt-6.1-sol`}
                </pre>
              </div>
            </div>

            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" asChild>
                <Link to="/guide">
                  استعراض دليل الربط الكامل وشروحات Python و VSCode
                  <ExternalLink size={13} className="mr-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CASE 2: PENDING APPROVAL (WAITING ROOM) */}
      {subStatus === "pending_approval" && (
        <div className="p-8 rounded-2xl bg-card border border-amber-500/30 shadow-lg text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 ring-4 ring-amber-500/10">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">طلبك قيد المراجعة والانتظار ⏳</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              تم استلام بيانات تحويلك بنجاح. سيقوم الأدمن بمطابقة التحويل وتفعيل مفتاح الـ API الخاص بك فور
              التأكد. يظل حسابك في وضع الانتظار المؤقت حتى الاعتماد.
            </p>
          </div>

          {pendingOrder && (
            <div className="p-4 rounded-xl bg-background border border-border max-w-md mx-auto text-xs space-y-2 text-right">
              <div className="flex justify-between">
                <span className="text-muted-foreground">رقم الطلب:</span>
                <span className="font-mono font-bold">{pendingOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الباقة المطلوبة:</span>
                <span className="font-bold">باقة {pendingOrder.tier}$</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">وسيلة الدفع:</span>
                <span className="font-bold">
                  {pendingOrder.type === "vodafone_cash"
                    ? "فودافون كاش"
                    : pendingOrder.type === "bybit_crypto"
                    ? "تحويل Bybit"
                    : "انستاباي / يدوي"}
                </span>
              </div>
              {pendingOrder.paymentUrl && (
                <div className="pt-2">
                  <Button variant="default" size="sm" className="w-full" asChild>
                    <a href={pendingOrder.paymentUrl} target="_blank" rel="noreferrer">
                      استكمال الدفع عبر فودافون كاش <ExternalLink size={14} />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <Button variant="premium" onClick={fetchSubscription}>
              <RefreshCw size={15} />
              تحديث وفحص التفعيل الآن
            </Button>
            <Button variant="glass" asChild>
              <a href="https://t.me/subscnow" target="_blank" rel="noreferrer">
                <Send size={15} />
                مراسلة الدعم لتسريع التفعيل على تيليجرام
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* CASE 3: NO SUBSCRIPTION (CHOOSE PACKAGE) */}
      {subStatus === "none" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border text-center space-y-2">
            <h2 className="text-xl font-bold">اختر باقتك وفعل مفتاحك الآن</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              اختر إحدى الباقات التالية لتفعيل اشتراكك واستلام مفتاح SubscAPI المباشر عبر فودافون كاش،
              Bybit، أو انستاباي.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packages.map((pack) => (
              <div
                key={pack.id}
                className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-primary font-mono" dir="ltr">
                      {pack.english}
                    </span>
                    <span className="text-xs text-muted-foreground">${pack.amount} USD</span>
                  </div>
                  <h4 className="font-bold text-base">{pack.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{pack.description}</p>
                </div>

                <div className="space-y-2">
                  <div className="text-lg font-bold text-primary font-mono" dir="ltr">
                    ${pack.amount}
                  </div>
                  <Button
                    variant="premium"
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedPack(pack)}
                  >
                    <KeyRound size={14} />
                    اشتراك ودفع
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Checkout selected={selectedPack} close={() => setSelectedPack(null)} />
        </div>
      )}
    </div>
  );
}
