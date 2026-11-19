import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "./subsc";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  isAdmin: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isSignedIn: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  register: (name: string, email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: (tab?: "login" | "register") => void;
  closeAuthModal: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isSignedIn: false,
  isAdmin: false,
  isLoading: true,
  login: async () => false,
  register: async () => false,
  logout: () => {},
  isAuthModalOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Load user session on initial boot
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("subsc_auth_token");
      const savedUserStr = localStorage.getItem("subsc_user");
      if (savedToken && savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        setToken(savedToken);
        setUser(parsed);
      }
    } catch (e) {
      console.error("Failed to parse saved auth data:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password = "password123"): Promise<boolean> => {
    try {
      const res = await api<{
        success: boolean;
        token: string;
        user: User;
        error?: string;
      }>("/api/auth/login", {
        method: "POST",
        data: { email, password },
      });

      if (res && res.success && res.user) {
        setUser(res.user);
        setToken(res.token);
        localStorage.setItem("subsc_auth_token", res.token);
        localStorage.setItem("subsc_user", JSON.stringify(res.user));
        setIsAuthModalOpen(false);

        if (res.user.isAdmin) {
          toast.success(`مرحباً بك يا مدير النظام (${res.user.name})! تم التعرف على صلاحيات الإدارة.`);
        } else {
          toast.success(`أهلاً بك، ${res.user.name}! تم تسجيل الدخول بنجاح.`);
        }
        return true;
      }
      return false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل الدخول");
      return false;
    }
  };

  const register = async (name: string, email: string, password = "password123"): Promise<boolean> => {
    try {
      const res = await api<{
        success: boolean;
        token: string;
        user: User;
        error?: string;
      }>("/api/auth/register", {
        method: "POST",
        data: { name, email, password },
      });

      if (res && res.success && res.user) {
        setUser(res.user);
        setToken(res.token);
        localStorage.setItem("subsc_auth_token", res.token);
        localStorage.setItem("subsc_user", JSON.stringify(res.user));
        setIsAuthModalOpen(false);
        toast.success(`تم إنشاء حسابك بنجاح! مرحباً بك يا ${res.user.name}.`);
        return true;
      }
      return false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنشاء الحساب");
      return false;
    }
  };

  const logout = () => {
    try {
      if (token) {
        api("/api/auth/logout", { method: "POST", data: { token } }).catch(() => {});
      }
    } catch {}
    setUser(null);
    setToken(null);
    localStorage.removeItem("subsc_auth_token");
    localStorage.removeItem("subsc_user");
    toast.info("تم تسجيل الخروج بنجاح.");
    if (window.location.pathname.includes("sys-portal") || window.location.pathname.includes("dashboard")) {
      window.location.href = "/";
    }
  };

  const openAuthModal = (tab: "login" | "register" = "login") => {
    setActiveTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => setIsAuthModalOpen(false);

  const isSignedIn = !!user;
  const isAdmin = !!user?.isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isSignedIn,
        isAdmin,
        isLoading,
        login,
        register,
        logout,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
      <AuthModal
        open={isAuthModalOpen}
        onOpenChange={setIsAuthModalOpen}
        defaultTab={activeTab}
        onLogin={login}
        onRegister={register}
      />
    </AuthContext.Provider>
  );
}

function AuthModal({
  open,
  onOpenChange,
  defaultTab,
  onLogin,
  onRegister,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab: "login" | "register";
  onLogin: (email: string, password?: string) => Promise<boolean>;
  onRegister: (name: string, email: string, password?: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(name, email, password);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 text-right" dir="rtl">
        <DialogHeader className="text-right space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span>{tab === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}</span>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck size={18} />
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {tab === "login"
              ? "أدخل بريدك الإلكتروني للوصول إلى مفاتيحك ورصيدك."
              : "أنشئ حسابك لبدء استخدام مفاتيح SubscAPI والاشتراكات."}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-muted p-1 gap-1 text-xs font-medium my-2">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              tab === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LogIn size={14} />
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              tab === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus size={14} />
            حساب جديد
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 mt-2">
          {tab === "register" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground block">الاسم بالكامل</label>
              <div className="relative">
                <UserIcon size={15} className="absolute right-3 top-3 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="محمد أحمد"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-right"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground block">البريد الإلكتروني</label>
            <div className="relative">
              <Mail size={15} className="absolute right-3 top-3 text-muted-foreground pointer-events-none" />
              <input
                type="email"
                required
                dir="ltr"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-left"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground block">كلمة المرور</label>
            </div>
            <div className="relative">
              <Lock size={15} className="absolute right-3 top-3 text-muted-foreground pointer-events-none" />
              <input
                type="password"
                required
                dir="ltr"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-left"
              />
            </div>
          </div>

          <Button type="submit" variant="premium" className="w-full mt-4" disabled={loading}>
            {loading ? (
              <Loader2 size={16} className="animate-spin ml-2" />
            ) : tab === "login" ? (
              <LogIn size={16} className="ml-2" />
            ) : (
              <UserPlus size={16} className="ml-2" />
            )}
            {loading ? "جارٍ التحقق..." : tab === "login" ? "دخول إلى الحساب" : "إنشاء حساب ومتابعة"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
