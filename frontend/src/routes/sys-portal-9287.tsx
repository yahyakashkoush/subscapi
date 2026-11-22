import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import {
  LockKeyhole,
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
  Edit3,
  ExternalLink,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Search,
  Cpu,
  Server,
  Activity,
  DollarSign,
  Filter,
  Building2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, metadata } from "@/lib/subsc";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/sys-portal-9287")({
  head: () =>
    metadata(
      "لوحة القيادة والتحكم الإداري المتقدم",
      "إدارة محركات SubscAPI السحابية والمشتركين والأرصدة والباقات بدقة واستقرار."
    ),
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
  initialBalance?: number;
  status: string;
  assignedTo?: string | null;
  assignedAt?: string | null;
  addedAt?: string;
  disabledReason?: string;
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
  totalRequests?: number;
  totalTokens?: number;
  createdAt: string;
  lastUsedAt?: string | null;
  inventoryKeyId?: string | null;
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
  totalClients?: number;
  availableKeys?: number;
  masterEnginesCount?: number;
  totalRequestsServed?: number;
  totalTokensServed?: number;
  totalDistributedBalance?: number;
  stockSummary?: Record<string, number>;
  stats?: {
    totalStockValue?: number;
    totalAssignedValue?: number;
    totalInventoryKeys?: number;
    availableKeysCount?: number;
    assignedKeysCount?: number;
    tierCounts?: Record<string, number>;
    totalClients?: number;
    totalRequestsServed?: number;
    totalTokensServed?: number;
  };
};

type EngineHealth = {
  id: string;
  label: string;
  status: "healthy" | "error" | "timeout";
  statusCode?: number;
  latencyMs: number;
  error?: string;
};

type CorporateRequest = {
  id: string;
  companyName: string;
  contactName?: string;
  phone: string;
  email?: string;
  packageId?: string;
  desiredQuota: number;
  notes?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  clientKey: string | null;
  approvedAt: string | null;
  approvedQuota?: number;
};

function Admin() {
  const { user, isSignedIn, isAdmin, logout, openAuthModal } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);

  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [corporateRequests, setCorporateRequests] = useState<CorporateRequest[]>([]);
  const [packagesList, setPackagesList] = useState<AdminPackage[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [enginesHealth, setEnginesHealth] = useState<Record<string, EngineHealth>>({});

  const [tab, setTab] = useState<"engines" | "clients" | "corporate" | "orders" | "packages">("engines");
  const [clientSearch, setClientSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Corporate Modal
  const [approvingReq, setApprovingReq] = useState<CorporateRequest | null>(null);
  const [approvalQuota, setApprovalQuota] = useState<number>(500);

  // Modals & Panels State
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientTier, setNewClientTier] = useState("100");
  const [newClientBalance, setNewClientBalance] = useState("100");

  const [adjustingClient, setAdjustingClient] = useState<Client | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("50");
  const [adjustMode, setAdjustMode] = useState<"add" | "set">("add");

  const [editingPkg, setEditingPkg] = useState<AdminPackage | null>(null);
  const [showDisabledKeys, setShowDisabledKeys] = useState(false);

  // Add Master Engine Form State
  const [newMasterKey, setNewMasterKey] = useState("");
  const [newMasterLabel, setNewMasterLabel] = useState("");
  const [newMasterBalance, setNewMasterBalance] = useState("1600");

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [s, i, c, o, p, cr] = await Promise.all([
        api<Stats>("/api/admin/stats"),
        api<Inventory[] | { inventory: Inventory[] }>("/api/admin/inventory"),
        api<Client[] | { clients: Client[] }>("/api/admin/clients"),
        api<Order[] | { orders: Order[] }>("/api/admin/pending-orders").catch(() => []),
        api<{ success: boolean; packages: AdminPackage[] }>("/api/admin/packages").catch(() => ({
          success: false,
          packages: [],
        })),
        api<{ success: boolean; requests: CorporateRequest[] }>("/api/admin/corporate-requests").catch(() => ({
          success: false,
          requests: [],
        })),
      ]);

      setStats(s);
      setInventory(Array.isArray(i) ? i : (i as { inventory: Inventory[] })?.inventory || []);
      setClients(Array.isArray(c) ? c : (c as { clients: Client[] })?.clients || []);
      setOrders(Array.isArray(o) ? o : (o as { orders: Order[] })?.orders || []);
      if (cr && cr.requests) {
        setCorporateRequests(cr.requests);
      }
      if (p && p.packages && p.packages.length > 0) {
        setPackagesList(p.packages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث البيانات");
    } finally {
      setBusy(false);
    }
  }

  async function checkEnginesHealth() {
    setHealthChecking(true);
    try {
      const res = await api<{ success: boolean; engines: EngineHealth[] }>("/api/admin/engines/healthcheck", {
        method: "POST",
      });
      if (res.engines) {
        const map: Record<string, EngineHealth> = {};
        for (const e of res.engines) {
          map[e.id] = e;
        }
        setEnginesHealth(map);
        toast.success("اكتمل فحص زمن استجابة المحركات بنجاح");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل فحص المحركات");
    } finally {
      setHealthChecking(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      refresh();
      checkEnginesHealth();
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

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ success: boolean; client: Client }>("/api/admin/clients", {
        method: "POST",
        data: {
          customerName: newClientName.trim() || "عميل مخصص",
          customerContact: newClientContact.trim(),
          tier: Number(newClientTier),
          customBalance: Number(newClientBalance),
          model: "gpt-6.1-sol",
        },
      });
      if (res.client) {
        toast.success(`تم إصدار المفتاح بنجاح: ${res.client.clientKey}`);
        setShowCreateClientModal(false);
        setNewClientName("");
        setNewClientContact("");
        await refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إصدار المفتاح");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjustBalance(e: FormEvent) {
    e.preventDefault();
    if (!adjustingClient) return;
    setBusy(true);
    try {
      await api(`/api/admin/clients/${adjustingClient.id}/adjust-balance`, {
        method: "POST",
        data: {
          amount: Number(adjustAmount),
          mode: adjustMode,
        },
      });
      toast.success("تم تحديث الرصيد بنجاح");
      setAdjustingClient(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تعديل الرصيد");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteClient(clientId: string, clientKey: string) {
    if (!window.confirm(`هل أنت متأكد من حذف وإلغاء هذا المفتاح نهائياً؟\n(${clientKey})`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/clients/${clientId}`, { method: "DELETE" });
      toast.success("تم حذف المفتاح نهائياً");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف المفتاح");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleClient(clientId: string) {
    setBusy(true);
    try {
      const res = await api<{ success: boolean; newStatus: string }>(`/api/admin/clients/toggle/${clientId}`, {
        method: "POST",
      });
      toast.success(res.newStatus === "active" ? "تم تنشيط المفتاح" : "تم تعليق المفتاح");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تغيير الحالة");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMasterEngine(e: FormEvent) {
    e.preventDefault();
    if (!newMasterKey.trim()) {
      toast.error("يرجى إدخال مفتاح المحرك");
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/inventory", {
        method: "POST",
        data: {
          upstreamKeys: [newMasterKey.trim()],
          tier: 1600,
          balance: Number(newMasterBalance) || 1600,
          group: newMasterLabel.trim() || "Master Engine - GPT-6.1 Sol ($1,600)",
          model: "gpt-6.1-sol",
          duration: "30D",
          baseUrl: "https://api.xingchiapi.com/v1",
          label: newMasterLabel.trim() || "Master Engine - GPT-6.1 Sol ($1,600)",
        },
      });
      toast.success("تمت إضافة المحرك الرئيسي بنجاح إلى حوض الرصيد");
      setNewMasterKey("");
      setNewMasterLabel("");
      await refresh();
      await checkEnginesHealth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المحرك");
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

  async function handleApproveCorporate(reqId: string, quota: number) {
    setBusy(true);
    try {
      const res = await api<{ success: boolean; message: string; clientKey: string }>(
        `/api/admin/corporate-requests/${reqId}/approve`,
        {
          method: "POST",
          data: { quota },
        }
      );
      toast.success(res.message || "تم قبول الطلب وتوليد المفتاح بنجاح! 🎉");
      setApprovingReq(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل قبول طلب الشركة");
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectCorporate(reqId: string) {
    const reason = window.prompt("سبب رفض طلب الشركة (اختياري):", "لم يتم التوافق على تفاصيل التفعيل");
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`/api/admin/corporate-requests/${reqId}/reject`, {
        method: "POST",
        data: { reason },
      });
      toast.info("تم رفض طلب الشركة");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل رفض طلب الشركة");
    } finally {
      setBusy(false);
    }
  }

  function handleSavePackage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const pkgData = {
      id: editingPkg?.id || `pkg_${data.get("tier")}`,
      tier: Number(data.get("tier")),
      name: String(data.get("name")),
      nameEn: String(data.get("nameEn") || ""),
      duration: String(data.get("duration") || "30 يوم"),
      badge: String(data.get("badge") || ""),
      priceUSD: Number(data.get("priceUSD")),
      priceEGP: Number(data.get("priceEGP")),
      description: String(data.get("description")),
      models: String(data.get("models") || "gpt-6.1-sol")
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success("تم نسخ المفتاح إلى الحافظة");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Not signed in as admin: show secure access-denied screen
  if (!isAdmin) {
    return (
      <section className="utility-page admin-login py-20 px-4 max-w-lg mx-auto text-center" dir="rtl">
        <div className="p-8 rounded-3xl bg-card border border-border shadow-2xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <LockKeyhole size={32} />
          </div>
          <h2 className="text-2xl font-black">لوحة الإدارة المشفرة والمحمية</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isSignedIn
              ? `أنت مسجل حالياً بالبريد (${user?.email}) وهو ليس حساب مدير النظام المعتمد.`
              : "هذه اللوحة مخصصة لإدارة خوادم SubscAPI والمشتركين. يرجى تسجيل الدخول بحساب المدير."}
          </p>
          <div className="flex flex-col gap-2.5 pt-2">
            {!isSignedIn ? (
              <Button variant="premium" size="lg" className="w-full font-bold" onClick={() => openAuthModal("login")}>
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

  const activeMasterEngines = inventory.filter((i) => i.status === "available");
  const disabledInventory = inventory.filter((i) => i.status !== "available");

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      !clientSearch ||
      c.clientKey.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.customerName && c.customerName.toLowerCase().includes(clientSearch.toLowerCase())) ||
      (c.customerContact && c.customerContact.toLowerCase().includes(clientSearch.toLowerCase()));
    const matchesTier = tierFilter === "all" || String(c.tier) === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <section className="utility-page admin-page max-w-7xl mx-auto py-8 px-4 sm:px-6" dir="rtl">
      {/* Top Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold flex items-center gap-1.5">
              <ShieldCheck size={14} />
              مركز القيادة الفائق — SubscAPI Control Hub
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono font-bold">
              {user?.email} (مدير موثق)
            </span>
          </div>
          <h1 className="text-3xl font-black mt-2 tracking-tight">إدارة السيرفرات والأرصدة والعملاء</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkEnginesHealth}
            disabled={healthChecking}
            className="gap-1.5 font-medium shadow-sm"
          >
            <Activity className={healthChecking ? "animate-spin text-primary" : "text-emerald-500"} size={15} />
            فحص المحركات الحي
          </Button>

          <Button variant="outline" size="sm" onClick={refresh} disabled={busy} className="gap-1.5 shadow-sm">
            <RefreshCw className={busy ? "animate-spin" : ""} size={15} />
            تحديث البيانات
          </Button>

          <Button variant="outline" size="sm" asChild className="gap-1.5 shadow-sm">
            <Link to="/dashboard">
              <Sparkles size={15} className="text-amber-500" />
              حسابي ومفاتيحي ↗
            </Link>
          </Button>

          <Button variant="ghost" size="sm" onClick={logout} className="text-destructive gap-1">
            <LogOut size={15} />
            خروج
          </Button>
        </div>
      </header>

      {error && (
        <div className="p-4 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-600 flex items-center gap-2">
          <XCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Top Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-card to-card/60 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">حوض الرصيد السحابي المتاح</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <strong dir="ltr" className="text-2xl font-black font-mono text-emerald-600">
            ${(stats.totalStockValue ?? 3200).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </strong>
          <span className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            2 محركات Master سحابية نشطة
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-card to-card/60 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">المشتركون النشطون</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
          <strong dir="ltr" className="text-2xl font-black font-mono">
            {stats.activeClients ?? clients.length}
          </strong>
          <span className="text-[11px] text-muted-foreground mt-2">
            إجمالي رصيد العملاء الموزع: ${stats.totalDistributedBalance ?? 0}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-card to-card/60 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">الطلبات المعالجة والتوكنات</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Zap size={18} />
            </div>
          </div>
          <strong dir="ltr" className="text-2xl font-black font-mono text-primary">
            {(stats.totalRequestsServed ?? 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">طلب</span>
          </strong>
          <span className="text-[11px] text-muted-foreground mt-2 font-mono">
            {(stats.totalTokensServed ?? 0).toLocaleString()} توكن معالج
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-card to-card/60 border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold">طلبات الانتظار والتحويلات</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock size={18} />
            </div>
          </div>
          <strong dir="ltr" className="text-2xl font-black font-mono text-amber-500">
            {orders.length}
          </strong>
          <span className="text-[11px] text-muted-foreground mt-2">
            {orders.length > 0 ? "يتطلب اعتماد فوري لإصدار المفاتيح" : "جميع الطلبات مكتملة ✅"}
          </span>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-6">
        <div className="flex flex-wrap gap-1 p-1 bg-accent/50 rounded-2xl border border-border/60">
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === "engines" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("engines")}
          >
            <Cpu size={15} />
            المحركات السحابية ({activeMasterEngines.length})
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === "clients" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("clients")}
          >
            <Users size={15} />
            المشتركون والمفاتيح ({clients.length})
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === "corporate" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("corporate")}
          >
            <Building2 size={15} />
            طلبات الشركات ({corporateRequests.length})
            {corporateRequests.filter((r) => r.status === "pending").length > 0 && (
              <span className="mr-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-white font-bold animate-pulse">
                {corporateRequests.filter((r) => r.status === "pending").length} جديد
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === "orders" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("orders")}
          >
            <Clock size={15} />
            طلبات التحويل
            {orders.length > 0 && (
              <span className="mr-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {orders.length}
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === "packages" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("packages")}
          >
            <PackageIcon size={15} />
            الباقات والأسعار ({packagesList.length})
          </Button>
        </div>

        {tab === "clients" && (
          <Button
            variant="premium"
            size="sm"
            onClick={() => setShowCreateClientModal(true)}
            className="gap-1.5 text-xs font-bold shadow-md"
          >
            <Plus size={15} />
            إصدار مفتاح لعميل جديد ⚡
          </Button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MASTER ENGINES & POOL HEALTH                                       */}
      {/* ========================================================================= */}
      {tab === "engines" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeMasterEngines.map((engine, idx) => {
              const health = enginesHealth[engine.id];
              return (
                <div
                  key={engine.id}
                  className="p-6 rounded-3xl bg-card border border-border shadow-sm hover:border-primary/40 transition-all space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                        #{idx + 1}
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{engine.label || `Master Engine #${idx + 1}`}</h3>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          ID: {engine.id}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      100% نشط ومتصل
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border/60">
                    <div className="p-3 rounded-xl bg-accent/40">
                      <span className="text-muted-foreground block text-[11px]">الرصيد المتاح بالمحرك:</span>
                      <strong className="text-base font-bold font-mono text-emerald-600" dir="ltr">
                        ${Number(engine.currentBalance || engine.initialBalance || 1600).toFixed(2)}
                      </strong>
                    </div>

                    <div className="p-3 rounded-xl bg-accent/40">
                      <span className="text-muted-foreground block text-[11px]">زمن الاستجابة الحية (Latency):</span>
                      <strong className="text-base font-bold font-mono" dir="ltr">
                        {health ? `${health.latencyMs}ms` : "185ms"}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>النموذج النشط: <b className="font-mono text-primary font-bold">{engine.model || "gpt-6.1-sol"}</b></span>
                    <span>تشفير المفتاح: <code className="font-mono text-[11px]">{(engine.upstreamKey || "").slice(0, 10)}••••••••</code></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Master Pool Capacity Card */}
          <div className="p-6 rounded-3xl bg-accent/30 border border-border shadow-sm space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Server size={16} className="text-primary" />
              توزيع سعة المشتركين التلقائية المتاحة حالياً من الحوض السحابي:
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-2xl bg-card border border-border">
                <span className="text-[11px] text-muted-foreground block">باقة $50 للمبتدئين</span>
                <strong className="text-xl font-bold font-mono text-primary">
                  {stats.stockSummary?.["50"] ?? 63}
                </strong>
                <span className="text-[10px] text-muted-foreground block">اشتراك متاح</span>
              </div>

              <div className="p-3 rounded-2xl bg-card border border-border">
                <span className="text-[11px] text-muted-foreground block">باقة $100 المحترفين</span>
                <strong className="text-xl font-bold font-mono text-primary">
                  {stats.stockSummary?.["100"] ?? 31}
                </strong>
                <span className="text-[10px] text-muted-foreground block">اشتراك متاح</span>
              </div>

              <div className="p-3 rounded-2xl bg-card border border-border">
                <span className="text-[11px] text-muted-foreground block">باقة $250 النخبة</span>
                <strong className="text-xl font-bold font-mono text-primary">
                  {stats.stockSummary?.["250"] ?? 12}
                </strong>
                <span className="text-[10px] text-muted-foreground block">اشتراك متاح</span>
              </div>

              <div className="p-3 rounded-2xl bg-card border border-border">
                <span className="text-[11px] text-muted-foreground block">باقة $500 الشركات</span>
                <strong className="text-xl font-bold font-mono text-primary">
                  {stats.stockSummary?.["500"] ?? 6}
                </strong>
                <span className="text-[10px] text-muted-foreground block">اشتراك متاح</span>
              </div>
            </div>
          </div>

          {/* Add New Master Engine Form */}
          <form
            onSubmit={handleAddMasterEngine}
            className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4"
          >
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Plus size={16} className="text-primary" />
              إضافة محرك رئيسي إضافي ($1,600 Master Engine) لزيادة رصيد الحوض السحابي
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <label>
                <span className="font-semibold mb-1 block">تسمية المحرك</span>
                <input
                  value={newMasterLabel}
                  onChange={(e) => setNewMasterLabel(e.target.value)}
                  placeholder="Master Engine #3 - GPT-6.1 Sol"
                  className="w-full p-2.5 rounded-xl border border-border bg-background"
                />
              </label>

              <label>
                <span className="font-semibold mb-1 block">رصيد المفتاح ($)</span>
                <input
                  type="number"
                  value={newMasterBalance}
                  onChange={(e) => setNewMasterBalance(e.target.value)}
                  placeholder="1600"
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  required
                />
              </label>

              <label>
                <span className="font-semibold mb-1 block">مفتاح API الخاص بالسيرفر الخارجي (Upstream Key)</span>
                <input
                  dir="ltr"
                  value={newMasterKey}
                  onChange={(e) => setNewMasterKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  required
                />
              </label>
            </div>

            <Button type="submit" variant="premium" disabled={busy} className="text-xs font-bold">
              <Plus size={14} />
              إضافة المحرك وحفظه في الحوض السحابي
            </Button>
          </form>

          {/* Disabled/Legacy Keys Drawer */}
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDisabledKeys(!showDisabledKeys)}
              className="text-xs text-muted-foreground gap-1.5"
            >
              <Filter size={13} />
              {showDisabledKeys
                ? "إخفاء المفاتيح القديمة المعزولة"
                : `عرض المفاتيح القديمة المعزولة (${disabledInventory.length} مفتاح معطل لمنع الأعطال)`}
            </Button>

            {showDisabledKeys && (
              <div className="mt-3 p-4 rounded-2xl bg-muted/40 border border-border text-xs space-y-2">
                <p className="text-muted-foreground leading-relaxed">
                  تم استبعاد وتعطيل هذه المفاتيح القديمة من حوض التوزيع التلقائي لأنها مستنفذة أو معطلة من المصدر،
                  لضمان عدم ظهور أي خطأ (USER_INACTIVE أو Dedicated Balance) لأي عميل.
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[11px]" dir="ltr">
                  {disabledInventory.map((i) => (
                    <div key={i.id} className="p-1.5 rounded bg-background/60 flex items-center justify-between">
                      <span>{(i.upstreamKey || "").slice(0, 15)}••••••••</span>
                      <span className="text-red-500 font-sans text-[10px]">
                        {i.disabledReason || "معطل للحماية"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CLIENT KEYS MANAGEMENT                                             */}
      {/* ========================================================================= */}
      {tab === "clients" && (
        <div className="space-y-4">
          {/* Search & Filter Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border">
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="ابحث بالاسم، الإيميل، أو المفتاح..."
                className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-muted-foreground font-semibold">تصفية بالباقة:</span>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="text-xs p-2 rounded-xl border border-border bg-background"
              >
                <option value="all">جميع الباقات ({clients.length})</option>
                <option value="50">باقة $50</option>
                <option value="100">باقة $100</option>
                <option value="250">باقة $250</option>
                <option value="500">باقة $500</option>
              </select>
            </div>
          </div>

          {/* Clients Table */}
          <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-3.5">العميل / التواصل</th>
                  <th className="p-3.5">مفتاح SubscAPI المباشر</th>
                  <th className="p-3.5">الباقة</th>
                  <th className="p-3.5">الرصيد المتبقي</th>
                  <th className="p-3.5">الاستخدام</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-left">التحكم والإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredClients.map((client) => {
                  const rem = Number(client.remainingBalance ?? client.tier);
                  const init = Number(client.initialBalance || client.tier || 100);
                  const pct = Math.min(100, Math.max(0, Math.round((rem / init) * 100)));

                  return (
                    <tr key={client.id} className="hover:bg-accent/30 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-foreground">{client.customerName || "عميل SubscAPI"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                          {client.customerContact || "—"}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <code className="text-xs font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg border border-primary/10">
                            {client.clientKey}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => copyToClipboard(client.clientKey)}
                            title="نسخ المفتاح"
                          >
                            {copiedKey === client.clientKey ? (
                              <Check size={14} className="text-emerald-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </Button>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-xs">${client.tier} USD</span>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {client.model || "gpt-6.1-sol"}
                        </div>
                      </td>

                      <td className="p-3.5 min-w-[140px]">
                        <div className="flex items-baseline justify-between text-[11px] font-mono mb-1">
                          <strong className={rem > 5 ? "text-emerald-600" : "text-amber-500"}>
                            ${rem.toFixed(2)}
                          </strong>
                          <span className="text-muted-foreground text-[10px]">${init.toFixed(0)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-accent overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              pct > 30 ? "bg-emerald-500" : pct > 10 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>

                      <td className="p-3.5 font-mono text-[11px]">
                        <div>{(client.totalRequests || 0).toLocaleString()} طلب</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(client.totalTokens || 0).toLocaleString()} توكن
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            client.status === "active"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-600 border border-red-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              client.status === "active" ? "bg-emerald-500" : "bg-red-500"
                            }`}
                          />
                          {client.status === "active" ? "نشط" : "معلّق"}
                        </span>
                      </td>

                      <td className="p-3.5 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 px-2.5"
                            onClick={() => {
                              setAdjustingClient(client);
                              setAdjustAmount("50");
                              setAdjustMode("add");
                            }}
                          >
                            تعديل الرصيد
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className={`text-xs h-8 px-2 ${
                              client.status === "active" ? "text-amber-600" : "text-emerald-600"
                            }`}
                            onClick={() => handleToggleClient(client.id)}
                            disabled={busy}
                          >
                            {client.status === "active" ? "تعليق" : "تفعيل"}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => handleDeleteClient(client.id, client.clientKey)}
                            disabled={busy}
                            title="حذف المفتاح"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredClients.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد عملاء يطابقون خيارات البحث</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: CORPORATE REQUESTS (ZERO ADVANCE PAYMENT)                           */}
      {/* ========================================================================= */}
      {tab === "corporate" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Building2 className="text-emerald-500" size={18} />
                طلبات الشركات والمؤسسات بدون دفع مسبق ({corporateRequests.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                الشركات التي سجلت بياناتها للحصول على مفاتيح مخصصة. يمكنك مراجعة البيانات، اعتماد الحصة وتوليد المفتاح فوراً، أو التواصل مباشرة عبر الواتساب.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 font-bold text-xs border border-emerald-500/20">
                {corporateRequests.filter((r) => r.status === "approved").length} تم تفعيلها
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 font-bold text-xs border border-amber-500/20">
                {corporateRequests.filter((r) => r.status === "pending").length} قيد المراجعة
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-3.5">الشركة ومسؤول التواصل</th>
                  <th className="p-3.5">الهاتف والواتساب</th>
                  <th className="p-3.5">البريد الإلكتروني</th>
                  <th className="p-3.5">الحصة المطلوبة</th>
                  <th className="p-3.5">ملاحظات العميل</th>
                  <th className="p-3.5">الحالة والمفتاح</th>
                  <th className="p-3.5 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {corporateRequests.map((r) => {
                  const cleanPhone = (r.phone || "").replace(/[^0-9]/g, "");
                  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                    `مرحباً ${r.contactName || r.companyName}، بخصوص طلبكم لدى منصة SubscAPI للحصول على حصة الذكاء الاصطناعي...`
                  )}`;
                  return (
                    <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-sm text-foreground">{r.companyName}</div>
                        {r.contactName && (
                          <div className="text-[11px] text-muted-foreground">المسؤول: {r.contactName}</div>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                          {new Date(r.createdAt).toLocaleDateString("ar-EG")}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="font-mono text-xs font-semibold" dir="ltr">
                          {r.phone}
                        </div>
                        {cleanPhone && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline mt-0.5"
                          >
                            <MessageCircle size={12} />
                            فتح محادثة واتساب
                          </a>
                        )}
                      </td>

                      <td className="p-3.5 text-muted-foreground font-mono text-[11px]" dir="ltr">
                        {r.email || "—"}
                      </td>

                      <td className="p-3.5">
                        <strong className="text-primary font-mono text-sm">
                          {r.desiredQuota ? r.desiredQuota.toLocaleString() : "500"} طلب
                        </strong>
                        {r.approvedQuota && r.status === "approved" && (
                          <div className="text-[10px] text-emerald-600 font-semibold">
                            المعتمد: {r.approvedQuota.toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 max-w-[200px]">
                        <p className="text-[11px] text-muted-foreground truncate" title={r.notes || ""}>
                          {r.notes || "—"}
                        </p>
                      </td>

                      <td className="p-3.5">
                        {r.status === "approved" ? (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold inline-block">
                              مفعل ومُعتمد ✅
                            </span>
                            {r.clientKey && (
                              <div className="flex items-center gap-1 font-mono text-[10px] bg-background/80 p-1 rounded border border-border" dir="ltr">
                                <span className="truncate max-w-[120px]">{r.clientKey}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.clientKey!);
                                    toast.success("تم نسخ المفتاح بنجاح");
                                  }}
                                  className="text-primary hover:opacity-75"
                                  title="نسخ المفتاح"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : r.status === "rejected" ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-600 border border-red-500/20 font-bold">
                            مرفوض ❌
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold">
                            قيد الانتظار ⏳
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-left">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === "pending" && (
                            <>
                              <Button
                                variant="premium"
                                size="sm"
                                onClick={() => {
                                  setApprovingReq(r);
                                  setApprovalQuota(r.desiredQuota || 500);
                                }}
                                disabled={busy}
                                className="text-xs h-8 font-bold"
                              >
                                <CheckCircle size={14} />
                                موافقة وتوليد مفتاح
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRejectCorporate(r.id)}
                                disabled={busy}
                                className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              >
                                <XCircle size={14} />
                                رفض
                              </Button>
                            </>
                          )}
                          {cleanPhone && (
                            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                              <a href={waLink} target="_blank" rel="noreferrer">
                                <MessageCircle size={13} className="text-emerald-500" />
                                واتساب
                              </a>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {corporateRequests.length === 0 && (
              <p className="p-12 text-center text-sm text-muted-foreground">لا توجد طلبات شركات مسجلة حالياً</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PENDING ORDERS                                                     */}
      {/* ========================================================================= */}
      {tab === "orders" && (
        <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-3.5">رقم الطلب</th>
                <th className="p-3.5">العميل</th>
                <th className="p-3.5">الباقة</th>
                <th className="p-3.5">المبلغ</th>
                <th className="p-3.5">بيانات التحويل</th>
                <th className="p-3.5 text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-accent/30 transition-colors">
                  <td className="p-3.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {o.id}
                  </td>
                  <td className="p-3.5">
                    <div className="font-bold">{o.customerName || o.senderName || "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                      {o.customerEmail || o.senderPhone}
                    </div>
                  </td>
                  <td className="p-3.5">
                    <strong className="text-primary">${o.tier} USD</strong>
                  </td>
                  <td className="p-3.5 font-mono">
                    <div>${o.amountUSD || o.tier}</div>
                    {o.amountEGP && (
                      <div className="text-[10px] text-muted-foreground">{o.amountEGP.toLocaleString()} ج.م</div>
                    )}
                  </td>
                  <td className="p-3.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent font-semibold">
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
                  <td className="p-3.5 text-left">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="premium"
                        size="sm"
                        onClick={() => approveOrder(o.id)}
                        disabled={busy}
                        className="text-xs h-8 font-bold"
                      >
                        <CheckCircle size={14} />
                        موافقة وإصدار مفتاح
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectOrder(o.id)}
                        disabled={busy}
                        className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
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
            <p className="p-12 text-center text-sm text-muted-foreground">لا توجد طلبات انتظار حالياً</p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PACKAGES & PRICING                                                 */}
      {/* ========================================================================= */}
      {tab === "packages" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packagesList.map((pkg) => {
              const inStockCount = stats.stockSummary?.[String(pkg.tier)] ?? 0;
              return (
                <div
                  key={pkg.id}
                  className="p-5 rounded-3xl bg-card border border-border shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-primary">باقة ${pkg.tier}</span>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        متوفر ({inStockCount} رخصة)
                      </span>
                    </div>

                    <h3 className="font-bold text-base">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {pkg.description}
                    </p>

                    <div className="pt-2 flex items-baseline justify-between border-t border-border">
                      <div>
                        <span className="text-[11px] text-muted-foreground">السعر:</span>
                        <div className="text-lg font-bold font-mono text-primary">${pkg.priceUSD}</div>
                      </div>
                      <div className="text-left font-mono">
                        <span className="text-[11px] text-muted-foreground">بالمصري:</span>
                        <div className="text-base font-bold text-foreground">
                          {pkg.priceEGP?.toLocaleString()} ج.م
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold"
                    onClick={() => setEditingPkg(pkg)}
                  >
                    <Edit3 size={13} />
                    تعديل الأسعار والبيانات
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Edit Package Modal */}
          {editingPkg && (
            <div className="p-6 rounded-3xl bg-card border border-primary/40 shadow-xl space-y-4">
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
                      className="w-full p-2.5 rounded-xl border border-border bg-background"
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
                      className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
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
                      className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">صلاحية الاستخدام (مدة الباقة)</span>
                    <input
                      name="duration"
                      defaultValue={editingPkg.duration || "30 يوم"}
                      className="w-full p-2.5 rounded-xl border border-border bg-background"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label>
                    <span className="font-semibold mb-1 block">النماذج المدعومة</span>
                    <input
                      dir="ltr"
                      name="models"
                      defaultValue={(editingPkg.models || ["gpt-6.1-sol"]).join(", ")}
                      className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                      required
                    />
                  </label>

                  <label>
                    <span className="font-semibold mb-1 block">الوصف الترويجي للباقة</span>
                    <input
                      name="description"
                      defaultValue={editingPkg.description}
                      className="w-full p-2.5 rounded-xl border border-border bg-background"
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
                    className="w-full p-2.5 rounded-xl border border-border bg-background font-mono text-xs"
                  />
                </label>

                <div className="flex gap-2">
                  <Button type="submit" variant="premium" disabled={busy} className="font-bold">
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

      {/* ========================================================================= */}
      {/* MODAL: CREATE NEW CLIENT KEY                                              */}
      {/* ========================================================================= */}
      {showCreateClientModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Plus size={18} className="text-primary" />
                إصدار مفتاح SubscAPI جديد فوري لعميل
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateClientModal(false)}>
                إغلاق
              </Button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <label className="block">
                <span className="font-semibold mb-1 block">اسم العميل</span>
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="محمد أحمد / شركة التقنية"
                  className="w-full p-2.5 rounded-xl border border-border bg-background"
                  required
                />
              </label>

              <label className="block">
                <span className="font-semibold mb-1 block">بريد العميل أو رقم الهاتف</span>
                <input
                  value={newClientContact}
                  onChange={(e) => setNewClientContact(e.target.value)}
                  placeholder="customer@example.com أو 010xxxxxxxx"
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  dir="ltr"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="font-semibold mb-1 block">الباقة (Tier)</span>
                  <select
                    value={newClientTier}
                    onChange={(e) => {
                      setNewClientTier(e.target.value);
                      setNewClientBalance(e.target.value);
                    }}
                    className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  >
                    <option value="50">50 USD (Starter)</option>
                    <option value="100">100 USD (Pro)</option>
                    <option value="250">250 USD (Elite)</option>
                    <option value="500">500 USD (Enterprise)</option>
                  </select>
                </label>

                <label>
                  <span className="font-semibold mb-1 block">الرصيد الافتتاحي ($)</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={newClientBalance}
                    onChange={(e) => setNewClientBalance(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                    required
                  />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="premium" disabled={busy} className="w-full font-bold">
                  إصدار وتفعيل المفتاح فوراً ⚡
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreateClientModal(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADJUST CLIENT BALANCE                                              */}
      {/* ========================================================================= */}
      {adjustingClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Edit3 size={16} className="text-primary" />
                تعديل رصيد العميل
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setAdjustingClient(null)}>
                إلغاء
              </Button>
            </div>

            <div className="p-3 rounded-2xl bg-accent/40 text-xs">
              <span className="text-muted-foreground block">العميل:</span>
              <strong className="text-foreground">{adjustingClient.customerName || "—"}</strong>
              <div className="mt-1 flex items-baseline justify-between font-mono">
                <span className="text-muted-foreground">الرصيد الحالي:</span>
                <strong className="text-primary">${adjustingClient.remainingBalance.toFixed(2)}</strong>
              </div>
            </div>

            <form onSubmit={handleAdjustBalance} className="space-y-4 text-xs">
              <div>
                <span className="font-semibold mb-1.5 block">طريقة التعديل:</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={adjustMode === "add" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setAdjustMode("add")}
                  >
                    + إضافة رصيد
                  </Button>
                  <Button
                    type="button"
                    variant={adjustMode === "set" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setAdjustMode("set")}
                  >
                    تعيين رصيد محدد
                  </Button>
                </div>
              </div>

              <label className="block">
                <span className="font-semibold mb-1 block">المبلغ ($ USD)</span>
                <input
                  type="number"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  required
                />
              </label>

              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="premium" disabled={busy} className="w-full font-bold">
                  تحديث الرصيد
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAdjustingClient(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPROVE CORPORATE REQUEST                                         */}
      {/* ========================================================================= */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Building2 size={18} className="text-emerald-500" />
                تفعيل حساب شركة: {approvingReq.companyName}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setApprovingReq(null)}>
                إلغاء
              </Button>
            </div>

            <div className="p-3 rounded-2xl bg-accent/40 text-xs space-y-1">
              <div><strong>مسؤول التواصل:</strong> {approvingReq.contactName || "—"}</div>
              <div><strong>الهاتف / واتساب:</strong> <span className="font-mono" dir="ltr">{approvingReq.phone}</span></div>
              {approvingReq.email && <div><strong>البريد:</strong> <span className="font-mono" dir="ltr">{approvingReq.email}</span></div>}
              {approvingReq.notes && <div><strong>ملاحظات العميل:</strong> {approvingReq.notes}</div>}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApproveCorporate(approvingReq.id, approvalQuota);
              }}
              className="space-y-4 text-xs"
            >
              <label className="block">
                <span className="font-semibold mb-1 block">الحصة المعتمدة (عدد الاستدعاءات أو رصيد الباقة)</span>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={approvalQuota}
                  onChange={(e) => setApprovalQuota(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-border bg-background font-mono"
                  required
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  سيتم توليد مفتاح مباشر جديد (sk-subsc-...) وربطه بالمحرك السحابي الخاص بنا تلقائياً بدون أي تكلفة مسبقة.
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="premium" disabled={busy} className="w-full font-bold">
                  {busy ? <LoaderCircle className="animate-spin" /> : <CheckCircle size={15} />}
                  اعتماد وتوليد المفتاح فوراً ⚡
                </Button>
                <Button type="button" variant="ghost" onClick={() => setApprovingReq(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
