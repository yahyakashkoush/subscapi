import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import {
  LockKeyhole,
  ArrowLeft,
  LoaderCircle,
  Boxes,
  Users,
  Wallet,
  RefreshCw,
  Trash2,
  Plus,
  LogOut,
  Clock,
  CheckCircle,
  XCircle,
  Package as PackageIcon,
  Sparkles,
  Layers,
  Edit3,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, metadata } from "@/lib/subsc";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/sys-portal-9287")({
  head: () =>
    metadata("لوحة الإدارة والمخزن", "إدارة مخزون مفاتيح SubscAPI والعملاء ومتابعة الرصيد والأسعار."),
  component: Admin,
});

type Inventory = {
  id: string;
  upstreamKey?: string;
  key?: string;
  tier: number;
  group?: string;
  model?: string;
  duration?: string;
  label?: string;
  balance: number;
  currentBalance?: number;
  status: string;
  assignedTo?: string | null;
  assignedAt?: string | null;
  addedAt?: string;
};

type Client = {
  id: string;
  clientKey: string;
  customerName?: string;
  customerContact?: string;
  tier: number;
  model?: string;
  status: string;
  initialBalance: number;
  remainingBalance: number;
  createdAt: string;
};

type Order = {
  id: string;
  type: string;
  tier: number;
  model?: string;
  amountUSD: number;
  amountEGP?: number;
  customerName?: string;
  customerEmail?: string;
  senderName?: string;
  senderPhone?: string;
  transactionRef?: string;
  txID?: string;
  status: string;
  createdAt: string;
};

type AdminPackage = {
  id: string;
  tier: number;
  name: string;
  nameEn?: string;
  duration?: string;
  badge?: string;
  priceUSD: number;
  priceEGP: number;
  description: string;
  models: string[];
  features: string[];
};

type Stats = {
  totalStockValue?: number;
  totalValue?: number;
  activeClients?: number;
  availableKeys?: number;
  totalClients?: number;
  stockCounts?: Record<number, number>;
};

function Admin() {
  const { user, isSignedIn, isAdmin, logout, openAuthModal } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packagesList, setPackagesList] = useState<AdminPackage[]>([]);
  const [stats, setStats] = useState<Stats>({});

  const [tab, setTab] = useState<"orders" | "inventory" | "packages" | "clients">("orders");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");

  // Add Inventory Form State
  const [tier, setTier] = useState("100");
  const [model, setModel] = useState("GPT ASTRA");
  const [duration, setDuration] = useState("30 يوم (30D)");
  const [groupName, setGroupName] = useState("GPT ASTRA 100$ 30D");
  const [balance, setBalance] = useState("100");

  // Package Edit Modal State
  const [editingPkg, setEditingPkg] = useState<AdminPackage | null>(null);

  // Auto-fill group name when tier or model changes
  useEffect(() => {
    const dur = tier === "50" ? "7D" : "30D";
    const durLabel = tier === "50" ? "7 يوم (7D)" : "30 يوم (30D)";
    setDuration(durLabel);
    setBalance(tier === "custom" ? "100" : tier);
    setGroupName(`${model} ${tier === "custom" ? "100" : tier}$ ${dur}`);
  }, [tier, model]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [s, i, c, o, p] = await Promise.all([
        api<Stats>("/api/admin/stats"),
        api<Inventory[] | { inventory: Inventory[] }>("/api/admin/inventory"),
        api<Client[] | { clients: Client[] }>("/api/admin/clients"),
        api<Order[] | { orders: Order[] }>("/api/admin/pending-orders").catch(() => []),
        api<{ success: boolean; packages: AdminPackage[] }>("/api/admin/packages").catch(() => ({ success: false, packages: [] })),
      ]);

      setStats(s);
      setInventory(Array.isArray(i) ? i : (i as { inventory: Inventory[] })?.inventory || []);
      setClients(Array.isArray(c) ? c : (c as { clients: Client[] })?.clients || []);
      setOrders(Array.isArray(o) ? o : (o as { orders: Order[] })?.orders || []);
      if (p && p.packages && p.packages.length > 0) {
        setPackagesList(p.packages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث البيانات");
    } finally {
      setBusy(false);
    }
  }

  // Load data automatically when user is recognized as Admin
  useEffect(() => {
    if (isAdmin) {
      refresh();
    }
  }, [isAdmin]);

  async function action(path: string, method = "POST", data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, data });
      await refresh();
      toast.success("تم إتمام العملية بنجاح");
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
      toast.error(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function approveOrder(orderId: string) {
    if (!window.confirm("تأكيد استلام التحويل وإصدار المفتاح للعميل فوراً؟")) return;
    setBusy(true);
    try {
      const res = await api<{ success: boolean; message: string; clientKey: string }>(
        `/api/admin/orders/${orderId}/approve`,
        { method: "POST" }
      );
      toast.success(res.message || "تم تفعيل الاشتراك وتعيين المفتاح");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل اعتماد الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function rejectOrder(orderId: string) {
    const reason = window.prompt("سبب الرفض (اختياري):", "لم يتم العثور على إشعار التحويل");
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`/api/admin/orders/${orderId}/reject`, {
        method: "POST",
        data: { reason },
      });
      toast.info("تم رفض الطلب");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل رفض الطلب");
    } finally {
      setBusy(false);
    }
  }

  function handleAddInventory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const keysText = String(data.get("keys") || "");
    const keys = keysText
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      toast.error("يرجى إدخال مفتاح واحد على الأقل");
      return;
    }

    void action("/api/admin/inventory", "POST", {
      upstreamKeys: keys,
      tier: Number(tier === "custom" ? data.get("customTier") : tier),
      balance: Number(data.get("balance")),
      group: data.get("group"),
      model: data.get("model"),
      duration: data.get("duration"),
      baseUrl: data.get("baseUrl"),
      label: data.get("group"),
    });

    (e.target as HTMLFormElement).reset();
  }

  function handleSavePackage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const pkgData = {
      id: editingPkg?.id || `pkg_${data.get("tier")}_${Date.now().toString(36)}`,
      tier: Number(data.get("tier")),
      name: String(data.get("name")),
      nameEn: String(data.get("nameEn") || ""),
      duration: String(data.get("duration") || "30 يوم"),
      badge: String(data.get("badge") || ""),
      priceUSD: Number(data.get("priceUSD")),
      priceEGP: Number(data.get("priceEGP")),
      description: String(data.get("description")),
      models: String(data.get("models") || "GPT ASTRA, gpt-6.1-sol")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      features: String(data.get("features") || "")
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    };

    void action("/api/admin/packages", "POST", pkgData).then(() => {
      setEditingPkg(null);
      toast.success("تم حفظ الباقة بنجاح");
    });
  }

  // Not signed in as admin: show secure access-denied screen
  if (!isAdmin) {
    return (
      <section className="utility-page admin-login py-16 px-4 max-w-lg mx-auto text-center" dir="rtl">
        <div className="p-8 rounded-2xl bg-card border border-border shadow-lg space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <LockKeyhole size={28} />
          </div>
          <h2 className="text-xl font-bold">لوحة الإدارة المشفرة والمحمية</h2>
          <p className="text-sm text-muted-foreground">
            {isSignedIn
              ? `أنت مسجل حالياً بالبريد (${user?.email}) وهو ليس حساب مدير النظام المعتمد.`
              : "هذه الصفحة مخصصة لمدير النظام فقط. يرجى تسجيل الدخول بحساب المدير للاستخدام المباشر."}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {!isSignedIn ? (
              <Button variant="premium" size="lg" className="w-full" onClick={() => openAuthModal("login")}>
                تسجيل الدخول كمدير النظام
              </Button>
            ) : (
              <Button variant="outline" size="lg" className="w-full text-destructive" onClick={logout}>
                <LogOut size={16} />
                تسجيل الخروج والتبديل لحساب المدير
              </Button>
            )}
            <Button variant="ghost" asChild>
              <Link to="/">العودة إلى الموقع الرئيسي</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Extract distinct groups for filtering
  const distinctGroups = Array.from(
    new Set(
      inventory
        .map((i) => i.group || i.label || `${i.model || "Model"} ${i.tier}$`)
        .filter(Boolean)
    )
  );

  const filteredInventory =
    selectedGroupFilter === "all"
      ? inventory
      : inventory.filter(
          (i) => (i.group || i.label || `${i.model || "Model"} ${i.tier}$`) === selectedGroupFilter
        );

  return (
    <section className="utility-page admin-page max-w-6xl mx-auto py-8 px-4" dir="rtl">
      {/* Admin Heading & Quick Nav Toggle */}
      <div className="admin-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-kicker">لوحة تحكم النظام والمخزن</span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold">
              {user?.email} · مدير معتمد ✅
            </span>
          </div>
          <h1 className="text-2xl font-black mt-1">إدارة SubscAPI والأرصدة</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/">
              <ExternalLink size={14} />
              العودة للموقع الرئيسي ↗
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/dashboard">
              <Sparkles size={14} />
              حسابي ومفاتيحي ↗
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} size={14} />
            تحديث البيانات
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="text-destructive gap-1">
            <LogOut size={14} />
            خروج
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="metrics-grid grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <article className="metric-card p-4 rounded-xl bg-card border border-border">
          <Wallet className="text-primary mb-1" size={20} />
          <p className="text-xs text-muted-foreground">قيمة المخزون المتاح</p>
          <strong dir="ltr" className="text-xl font-bold font-mono">
            ${stats.totalStockValue ?? stats.totalValue ?? 0}
          </strong>
        </article>

        <article className="metric-card p-4 rounded-xl bg-card border border-border">
          <Boxes className="text-primary mb-1" size={20} />
          <p className="text-xs text-muted-foreground">المفاتيح المتاحة بالمخزن</p>
          <strong dir="ltr" className="text-xl font-bold font-mono">
            {stats.availableKeys ?? inventory.filter((i) => i.status === "available").length}
          </strong>
        </article>

        <article className="metric-card p-4 rounded-xl bg-card border border-border">
          <Users className="text-primary mb-1" size={20} />
          <p className="text-xs text-muted-foreground">العملاء النشطون</p>
          <strong dir="ltr" className="text-xl font-bold font-mono">
            {stats.activeClients ?? clients.filter((c) => c.status === "active").length}
          </strong>
        </article>

        <article className="metric-card p-4 rounded-xl bg-card border border-border">
          <Clock className="text-amber-500 mb-1" size={20} />
          <p className="text-xs text-muted-foreground">طلبات انتظار التحويل</p>
          <strong dir="ltr" className="text-xl font-bold font-mono text-amber-500">
            {orders.length}
          </strong>
        </article>
      </div>

      {/* Stock Summary per Tier */}
      <div className="tier-summary p-3 rounded-xl bg-accent/40 border border-border flex flex-wrap gap-4 text-xs mb-6">
        {[50, 100, 250].map((val) => (
          <span key={val} className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            باقة <b dir="ltr">${val}</b> :{" "}
            <span className="font-mono font-bold">
              {inventory.filter((i) => i.tier === val && i.status === "available").length}
            </span>{" "}
            مفاتيح متاحة
          </span>
        ))}
      </div>

      {/* Add Keys Form */}
      <form onSubmit={handleAddInventory} className="inventory-form p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4 mb-8">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Plus size={18} className="text-primary" />
          إضافة دفعة مفاتيح جديدة إلى المخزن وتصنيفها
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <label>
            <span className="font-semibold mb-1 block">الباقة (Tier)</span>
            <select
              dir="ltr"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background"
            >
              <option value="50">50 USD</option>
              <option value="100">100 USD</option>
              <option value="250">250 USD</option>
              <option value="custom">مخصص</option>
            </select>
          </label>

          <label>
            <span className="font-semibold mb-1 block">النموذج (Model)</span>
            <select
              dir="ltr"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background"
            >
              <option value="GPT ASTRA">GPT ASTRA</option>
              <option value="gpt-6.1-sol">gpt-6.1-sol</option>
            </select>
          </label>

          <label>
            <span className="font-semibold mb-1 block">الصلاحية (Duration)</span>
            <input
              name="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background"
              required
            />
          </label>

          <label>
            <span className="font-semibold mb-1 block">الرصيد الابتدائي ($)</span>
            <input
              name="balance"
              type="number"
              min="1"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full p-2 rounded-lg border border-border bg-background font-mono"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label>
            <span className="font-semibold mb-1 block">اسم المجموعة (Group Name)</span>
            <input
              name="group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="مثال: GPT ASTRA 250$ 30D"
              className="w-full p-2 rounded-lg border border-border bg-background"
              required
            />
          </label>

          <label>
            <span className="font-semibold mb-1 block">رابط المصدر المباشر (Base URL)</span>
            <input
              dir="ltr"
              name="baseUrl"
              type="url"
              defaultValue="https://api.xingchiapi.com/v1"
              className="w-full p-2 rounded-lg border border-border bg-background font-mono"
              required
            />
          </label>
        </div>

        <label className="block text-xs">
          <span className="font-semibold mb-1 block">
            مفاتيح المصدر (أضف كل مفتاح في سطر مستقل للإضافة دفعة واحدة)
          </span>
          <textarea
            dir="ltr"
            name="keys"
            required
            rows={4}
            placeholder={"sk-...\nsk-...\nsk-..."}
            className="w-full p-3 rounded-lg border border-border bg-background font-mono text-xs"
          />
        </label>

        <Button type="submit" variant="premium" disabled={busy}>
          <Plus size={16} />
          إضافة المفاتيح وحفظها في المجموعة
        </Button>
      </form>

      {/* Tabs Header */}
      <div className="table-heading flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="guide-tabs admin-tabs flex flex-wrap gap-1 p-1 bg-accent/50 rounded-xl" role="tablist">
          <Button
            variant="ghost"
            size="sm"
            className={tab === "orders" ? "bg-card shadow-sm font-bold text-primary" : ""}
            onClick={() => setTab("orders")}
          >
            <Clock size={15} />
            طلبات الانتظار
            {orders.length > 0 && (
              <span className="mr-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {orders.length}
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={tab === "inventory" ? "bg-card shadow-sm font-bold text-primary" : ""}
            onClick={() => setTab("inventory")}
          >
            <Boxes size={15} />
            المخزون ({inventory.length})
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={tab === "packages" ? "bg-card shadow-sm font-bold text-primary" : ""}
            onClick={() => setTab("packages")}
          >
            <PackageIcon size={15} />
            إدارة الباقات والأسعار
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={tab === "clients" ? "bg-card shadow-sm font-bold text-primary" : ""}
            onClick={() => setTab("clients")}
          >
            <Users size={15} />
            العملاء ({clients.length})
          </Button>
        </div>

        <div className="flex gap-2">
          {tab === "inventory" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                action("/api/admin/inventory/sync-all")
                  .then(() => toast.success("تمت مزامنة جميع الأرصدة"))
                  .catch((err) => toast.error(err.message))
                  .finally(() => setBusy(false));
              }}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} size={14} />
              مزامنة كل الأرصدة الحية ⚡
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: PENDING ORDERS */}
      {tab === "orders" && (
        <div className="table-scroll overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-3">رقم الطلب</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الباقة والنموذج</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">وسيلة الدفع وبيانات التحويل</th>
                <th className="p-3">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-accent/30">
                  <td className="p-3">
                    <code dir="ltr" className="text-[11px] font-mono text-muted-foreground">
                      {o.id}
                    </code>
                  </td>
                  <td className="p-3">
                    <div className="font-bold">{o.customerName || o.senderName || "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                      {o.customerEmail || o.senderPhone}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold">${o.tier} USD</div>
                    {o.model && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                        {o.model}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono">
                    <strong>${o.amountUSD || o.tier}</strong>
                    {o.amountEGP && (
                      <div className="text-[11px] text-muted-foreground">
                        {o.amountEGP.toLocaleString()} ج.م
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="state-label state-active">
                      {o.type === "vodafone_cash"
                        ? "فودافون كاش"
                        : o.type === "bybit_crypto"
                        ? "تحويل Bybit"
                        : "انستاباي / يدوي"}
                    </span>
                    {(o.transactionRef || o.txID) && (
                      <div className="text-[11px] font-mono mt-1 text-muted-foreground" dir="ltr">
                        Ref: {(o.transactionRef || o.txID)?.slice(0, 18)}...
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button
                        variant="premium"
                        size="sm"
                        onClick={() => approveOrder(o.id)}
                        disabled={busy}
                        className="text-xs"
                      >
                        <CheckCircle size={14} />
                        موافقة وإصدار مفتاح
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectOrder(o.id)}
                        disabled={busy}
                        className="text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <XCircle size={14} />
                        رفض
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد طلبات انتظار حالياً</p>
          )}
        </div>
      )}

      {/* TAB 2: INVENTORY */}
      {tab === "inventory" && (
        <div className="space-y-4">
          {/* Group Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
            <span className="text-muted-foreground font-semibold">تصفية حسب المجموعة:</span>
            <Button
              variant={selectedGroupFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedGroupFilter("all")}
              className="text-xs"
            >
              الكل ({inventory.length})
            </Button>
            {distinctGroups.map((grp) => {
              const count = inventory.filter(
                (i) => (i.group || i.label || `${i.model || "Model"} ${i.tier}$`) === grp
              ).length;
              return (
                <Button
                  key={grp}
                  variant={selectedGroupFilter === grp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedGroupFilter(grp)}
                  className="text-xs font-mono"
                >
                  {grp} ({count})
                </Button>
              );
            })}
          </div>

          <div className="table-scroll overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-3">المفتاح المصدر</th>
                  <th className="p-3">المجموعة</th>
                  <th className="p-3">النموذج</th>
                  <th className="p-3">الباقة</th>
                  <th className="p-3">المدة</th>
                  <th className="p-3">الرصيد</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-accent/30">
                    <td className="p-3">
                      <code dir="ltr" className="font-mono text-xs">
                        {(item.upstreamKey || item.key || "sk-").slice(0, 10)}••••••••
                      </code>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-accent border border-border">
                        {item.group || item.label || "—"}
                      </span>
                    </td>
                    <td className="p-3 font-mono">
                      <span className="font-bold text-primary">{item.model || "gpt-6.1-sol"}</span>
                    </td>
                    <td className="p-3">
                      <bdi className="font-bold">${item.tier}</bdi>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.duration || "30D"}</td>
                    <td className="p-3 font-mono">
                      <strong className="text-emerald-600">
                        ${Number(item.currentBalance ?? item.balance ?? item.tier).toFixed(2)}
                      </strong>
                    </td>
                    <td className="p-3">
                      <span
                        className={`state-label ${
                          item.status === "available" ? "state-active" : "text-amber-500 bg-amber-500/10"
                        }`}
                      >
                        {item.status === "available" ? "متاح بالمخزن" : `مخصص لـ ${item.assignedTo || "عميل"}`}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="مزامنة الرصيد الحي"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            action(`/api/admin/inventory/sync/${item.id}`)
                              .then(() => toast.success("تم تحديث الرصيد الحي"))
                              .catch((err) => toast.error(err.message))
                              .finally(() => setBusy(false));
                          }}
                        >
                          <RefreshCw size={13} />
                          مزامنة
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="حذف المفتاح"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("هل تريد حذف هذا المفتاح نهائياً من المخزن؟"))
                              void action(`/api/admin/inventory/${item.id}`, "DELETE");
                          }}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredInventory.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">لا توجد مفاتيح في هذا التصنيف</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PACKAGES & PRICING MANAGEMENT */}
      {tab === "packages" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packagesList.map((pkg) => {
              const inStockCount = inventory.filter(
                (i) => i.tier === pkg.tier && i.status === "available"
              ).length;
              return (
                <div
                  key={pkg.id}
                  className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-primary">
                        باقة ${pkg.tier}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          inStockCount > 0
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-600 border border-red-500/20"
                        }`}
                      >
                        {inStockCount > 0 ? `متوفر بالمخزن (${inStockCount})` : "نفدت الكمية"}
                      </span>
                    </div>

                    <h3 className="font-bold text-base">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground">{pkg.description}</p>

                    <div className="pt-2 flex items-baseline justify-between border-t border-border">
                      <div>
                        <span className="text-xs text-muted-foreground">السعر بالدولار:</span>
                        <div className="text-lg font-bold font-mono text-primary">${pkg.priceUSD}</div>
                      </div>
                      <div className="text-left font-mono">
                        <span className="text-xs text-muted-foreground">السعر بالجنيه:</span>
                        <div className="text-base font-bold text-foreground">
                          {pkg.priceEGP?.toLocaleString()} ج.م
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span>المدة: </span>
                      <b>{pkg.duration || "30 يوم"}</b>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span>النماذج: </span>
                      <span className="font-mono text-primary font-bold">
                        {(pkg.models || ["GPT ASTRA", "gpt-6.1-sol"]).join(" | ")}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setEditingPkg(pkg)}
                  >
                    <Edit3 size={14} />
                    تعديل السعر والبيانات
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Edit Package Modal / Panel */}
          {editingPkg && (
            <div className="p-6 rounded-2xl bg-card border border-primary/40 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Edit3 size={16} className="text-primary" />
                  تعديل أسعار وبيانات {editingPkg.name}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setEditingPkg(null)}>
                  إلغاء
                </Button>
              </div>

              <form onSubmit={handleSavePackage} className="space-y-4 text-xs">
                <input type="hidden" name="tier" defaultValue={editingPkg.tier} />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <label>
                    <span className="font-semibold mb-1 block">اسم الباقة (عربي)</span>
                    <input
                      name="name"
                      defaultValue={editingPkg.name}
                      className="w-full p-2 rounded-lg border border-border bg-background"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">السعر بالدولار ($ USD)</span>
                    <input
                      name="priceUSD"
                      type="number"
                      min="1"
                      defaultValue={editingPkg.priceUSD}
                      className="w-full p-2 rounded-lg border border-border bg-background font-mono"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">السعر بالمصري (ج.م EGP)</span>
                    <input
                      name="priceEGP"
                      type="number"
                      min="1"
                      defaultValue={editingPkg.priceEGP}
                      className="w-full p-2 rounded-lg border border-border bg-background font-mono"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">صلاحية الاستخدام (مدة الباقة)</span>
                    <input
                      name="duration"
                      defaultValue={editingPkg.duration || "30 يوم"}
                      className="w-full p-2 rounded-lg border border-border bg-background"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label>
                    <span className="font-semibold mb-1 block">النماذج المدعومة (مفصولة بفاصلة)</span>
                    <input
                      dir="ltr"
                      name="models"
                      defaultValue={(editingPkg.models || ["GPT ASTRA", "gpt-6.1-sol"]).join(", ")}
                      className="w-full p-2 rounded-lg border border-border bg-background font-mono"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">الوصف الترويجي للباقة</span>
                    <input
                      name="description"
                      defaultValue={editingPkg.description}
                      className="w-full p-2 rounded-lg border border-border bg-background"
                      required
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="font-semibold mb-1 block">المزايا (ميزة واحدة في كل سطر)</span>
                  <textarea
                    name="features"
                    rows={4}
                    defaultValue={(editingPkg.features || []).join("\n")}
                    className="w-full p-2 rounded-lg border border-border bg-background font-mono text-xs"
                  />
                </label>

                <div className="flex gap-2">
                  <Button type="submit" variant="premium" disabled={busy}>
                    حفظ التعديلات
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingPkg(null)}>
                    إلغاء
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLIENTS */}
      {tab === "clients" && (
        <div className="table-scroll overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-3">العميل</th>
                <th className="p-3">مفتاح SubscAPI</th>
                <th className="p-3">الباقة والنموذج</th>
                <th className="p-3">الرصيد المتبقي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-accent/30">
                  <td className="p-3">
                    <div className="font-bold">{client.customerName || "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                      {client.customerContact || ""}
                    </div>
                  </td>
                  <td className="p-3">
                    <code dir="ltr" className="font-mono text-xs text-primary font-bold">
                      {client.clientKey}
                    </code>
                  </td>
                  <td className="p-3">
                    <div>${client.tier} USD</div>
                    {client.model && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                        {client.model}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono">
                    <strong>${Number(client.remainingBalance ?? client.tier).toFixed(2)}</strong>
                  </td>
                  <td className="p-3">
                    <span
                      className={`state-label ${client.status === "active" ? "state-active" : ""}`}
                    >
                      {client.status === "active" ? "نشط" : "معلّق"}
                    </span>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="glass"
                      size="sm"
                      disabled={busy}
                      onClick={() => action(`/api/admin/clients/toggle/${client.id}`)}
                    >
                      {client.status === "active" ? "تعليق المفتاح" : "تفعيل المفتاح"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد عملاء حتى الآن</p>
          )}
        </div>
      )}
    </section>
  );
}
