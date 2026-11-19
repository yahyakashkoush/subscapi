import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, metadata } from "@/lib/subsc";
import { toast } from "sonner";
export const Route = createFileRoute("/admin")({
  head: () =>
    metadata("لوحة الإدارة والمخزن", "إدارة مخزون مفاتيح SubscAPI والعملاء ومتابعة الرصيد."),
  component: Admin,
});
type Inventory = {
  id: string;
  upstreamKey?: string;
  key?: string;
  tier: number;
  balance: number;
  status: string;
};
type Client = { id: string; clientKey: string; customerName?: string; status: string };
type Stats = {
  totalStockValue?: number;
  totalValue?: number;
  activeClients?: number;
  availableKeys?: number;
};
function Admin() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [tab, setTab] = useState("inventory");
  const [tier, setTier] = useState("100");
  async function refresh(auth = token) {
    const [s, i, c] = await Promise.all([
      api<Stats>("/api/admin/stats", { token: auth }),
      api<Inventory[] | { inventory: Inventory[] }>("/api/admin/inventory", { token: auth }),
      api<Client[] | { clients: Client[] }>("/api/admin/clients", { token: auth }),
    ]);
    setStats(s);
    setInventory(Array.isArray(i) ? i : i.inventory);
    setClients(Array.isArray(c) ? c : c.clients);
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await api<{ token: string }>("/api/admin/login", {
        method: "POST",
        data: { password: data.get("password") },
      });
      if (!result.token) throw new Error("لم يتم التحقق من صلاحيات الدخول");
      await refresh(result.token);
      setToken(result.token);
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, method = "POST", data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, data, token });
      await refresh();
      toast.success("تم تحديث المخزن");
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر تحديث المخزن");
    } finally {
      setBusy(false);
    }
  }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void action("/api/admin/inventory", "POST", {
      upstreamKeys: String(data.get("keys") || "")
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean),
      tier: Number(tier === "custom" ? data.get("customTier") : tier),
      balance: Number(data.get("balance")),
      baseUrl: data.get("baseUrl"),
      label: data.get("label"),
    });
  }
  if (!token)
    return (
      <section className="utility-page admin-login">
        <div className="section-heading">
          <div className="section-kicker">
            <LockKeyhole size={16} />
            مساحة آمنة
          </div>
          <h1>
            لوحة الإدارة <span>والمخزن.</span>
          </h1>
          <p>إدارة المفاتيح والعملاء، من مكان واحد.</p>
        </div>
        <form onSubmit={login} className="login-panel">
          <span className="modal-symbol">
            <LockKeyhole size={28} />
          </span>
          <h2>مرحباً بعودتك</h2>
          <label>
            كلمة مرور الإدارة
            <input
              name="password"
              type="password"
              placeholder="أدخل كلمة المرور"
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <Button type="submit" variant="premium" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}دخول لوحة الإدارة
            <ArrowLeft />
          </Button>
          <span className="secure-note">يتم التحقق من صلاحياتك عبر الخدمة</span>
        </form>
      </section>
    );
  return (
    <section className="utility-page admin-page">
      <div className="admin-heading">
        <div>
          <span className="section-kicker">إدارة المفاتيح والعملاء</span>
          <h1>لوحة الإدارة والمخزن</h1>
        </div>
        <Button variant="glass" onClick={() => setToken("")}>
          <LogOut />
          تسجيل الخروج
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="metrics-grid">
        {[
          {
            icon: Wallet,
            label: "قيمة المخزون",
            value: `$${stats.totalStockValue ?? stats.totalValue ?? 0}`,
          },
          {
            icon: Boxes,
            label: "المفاتيح المتاحة",
            value: stats.availableKeys ?? inventory.filter((i) => i.status === "available").length,
          },
          {
            icon: Users,
            label: "العملاء النشطون",
            value: stats.activeClients ?? clients.filter((c) => c.status === "active").length,
          },
        ].map((s) => (
          <article className="metric-card" key={s.label}>
            <s.icon />
            <p>{s.label}</p>
            <strong dir="ltr">{s.value}</strong>
          </article>
        ))}
      </div>
      <div className="tier-summary">
        {[100, 200, 500].map((value) => (
          <span key={value}>
            باقة <b dir="ltr">${value}</b> ·{" "}
            {inventory.filter((i) => i.tier === value && i.status === "available").length} مفاتيح
            متاحة
          </span>
        ))}
      </div>
      <form onSubmit={add} className="inventory-form">
        <h2>
          <Plus size={20} />
          إضافة إلى المخزن
        </h2>
        <div className="form-grid">
          <label>
            الباقة
            <select dir="ltr" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="100">100 USD</option>
              <option value="200">200 USD</option>
              <option value="500">500 USD</option>
              <option value="custom">مخصص</option>
            </select>
          </label>
          {tier === "custom" && (
            <label>
              قيمة الباقة
              <input name="customTier" type="number" min="1" required />
            </label>
          )}
          <label>
            الرصيد
            <input name="balance" type="number" min="0" step="0.01" required />
          </label>
          <label>
            اسم المجموعة
            <input name="label" placeholder="اسم اختياري" />
          </label>
          <label>
            عنوان الخدمة (Base URL)
            <input
              dir="ltr"
              name="baseUrl"
              type="url"
              defaultValue="https://api.xingchiapi.com/v1"
              required
            />
          </label>
        </div>
        <label>
          مفاتيح المصدر
          <textarea dir="ltr" name="keys" required rows={4} placeholder="sk-..." />
        </label>
        <Button type="submit" variant="premium" disabled={busy}>
          <Plus />
          إضافة المفاتيح
        </Button>
      </form>
      <div className="table-heading">
        <div className="guide-tabs admin-tabs" role="tablist" aria-label="بيانات الإدارة">
          <Button
            variant="ghost"
            role="tab"
            aria-selected={tab === "inventory"}
            aria-controls="admin-data"
            className={tab === "inventory" ? "selected-tab" : ""}
            onClick={() => setTab("inventory")}
          >
            <Boxes />
            المخزون
          </Button>
          <Button
            variant="ghost"
            role="tab"
            aria-selected={tab === "clients"}
            aria-controls="admin-data"
            className={tab === "clients" ? "selected-tab" : ""}
            onClick={() => setTab("clients")}
          >
            <Users />
            العملاء
          </Button>
        </div>
        <Button
          variant="glass"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            refresh()
              .catch((error) => setError(error.message))
              .finally(() => setBusy(false));
          }}
        >
          <RefreshCw />
          تحديث
        </Button>
      </div>
      <div
        className="table-scroll"
        id="admin-data"
        role="tabpanel"
        aria-label={tab === "inventory" ? "المخزون" : "العملاء"}
      >
        <table>
          <thead>
            <tr>
              {(tab === "inventory"
                ? ["المفتاح", "الباقة", "الرصيد", "الحالة", "الإجراءات"]
                : ["العميل", "المفتاح", "الحالة", "الإجراءات"]
              ).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab === "inventory"
              ? inventory.map((item) => (
                  <tr key={item.id}>
                    <td data-label="المفتاح">
                      <code dir="ltr">
                        {(item.upstreamKey || item.key || "sk-").slice(0, 7)}••••••
                      </code>
                    </td>
                    <td data-label="الباقة">
                      <bdi>${item.tier}</bdi>
                    </td>
                    <td data-label="الرصيد">
                      <bdi>${item.balance}</bdi>
                    </td>
                    <td data-label="الحالة">
                      <span
                        className={`state-label ${item.status === "available" ? "state-active" : ""}`}
                      >
                        {item.status === "available" ? "متاح" : "مخصص"}
                      </span>
                    </td>
                    <td data-label="الإجراءات" className="table-actions">
                      <Button
                        variant="ghost"
                        title="مزامنة الرصيد"
                        disabled={busy}
                        onClick={() => action(`/api/admin/inventory/sync/${item.id}`)}
                      >
                        <RefreshCw />
                        مزامنة
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="حذف المفتاح"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("هل تريد حذف هذا المفتاح من المخزن؟"))
                            void action(`/api/admin/inventory/${item.id}`, "DELETE");
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))
              : clients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="العميل">{client.customerName || "—"}</td>
                    <td data-label="المفتاح">
                      <code dir="ltr">{client.clientKey}</code>
                    </td>
                    <td data-label="الحالة">
                      <span
                        className={`state-label ${client.status === "active" ? "state-active" : ""}`}
                      >
                        {client.status === "active" ? "نشط" : "معلّق"}
                      </span>
                    </td>
                    <td data-label="الإجراءات" className="table-actions">
                      <Button
                        variant="glass"
                        disabled={busy}
                        onClick={() => action(`/api/admin/clients/toggle/${client.id}`)}
                      >
                        {client.status === "active" ? "تعليق" : "تفعيل"}
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {(tab === "inventory" ? inventory : clients).length === 0 && (
          <p className="empty-table">لا توجد بيانات حتى الآن</p>
        )}
      </div>
    </section>
  );
}
