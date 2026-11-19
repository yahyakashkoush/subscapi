import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Send, ShieldCheck, ArrowUpLeft, LogIn, Sparkles, ShieldAlert, LogOut, KeyRound, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/subsc";
import { useAuth } from "@/lib/auth";

const CurrencyContext = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({
  currency: "USD",
  setCurrency: () => {},
});
export const useCurrency = () => useContext(CurrencyContext);

export function SubscShell({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [menu, setMenu] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, isSignedIn, isAdmin, logout, openAuthModal } = useAuth();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      <div className="site-shell" dir="rtl">
        <header className="site-header">
          <div className="header-inner">
            <Link to="/" className="brand">
              <img src="/subsc-robot.png" alt="SubscAPI Logo" />
              <span dir="ltr">
                subsc<span className="brand-api">api</span>
                <span className="brand-dot">.</span>
              </span>
            </Link>
            <nav className={`main-nav ${menu ? "nav-open" : ""}`} aria-label="التنقل الرئيسي">
              <Link to="/" activeOptions={{ exact: true }} onClick={() => setMenu(false)}>
                باقات الأسعار
              </Link>
              <Link to="/balance" onClick={() => setMenu(false)}>
                فحص الرصيد
              </Link>
              <Link to="/guide" onClick={() => setMenu(false)}>
                دليل الربط
              </Link>
              {isSignedIn && (
                <Link to="/dashboard" onClick={() => setMenu(false)} className="nav-dashboard-link">
                  <Sparkles size={14} className="inline ml-1 text-primary" />
                  حسابي ومفاتيحي
                </Link>
              )}
              {isAdmin && (
                <Link to="/sys-portal-9287" onClick={() => setMenu(false)} className="text-amber-500 font-bold flex items-center gap-1">
                  <ShieldAlert size={14} />
                  لوحة الإدارة
                </Link>
              )}
            </nav>
            <div className="header-actions">
              <div className="currency-toggle" dir="ltr">
                {(["USD", "EGP"] as const).map((c) => (
                  <Button
                    key={c}
                    variant="ghost"
                    aria-pressed={currency === c}
                    className={currency === c ? "currency-active" : ""}
                    onClick={() => setCurrency(c)}
                  >
                    {c}
                    <span>{c === "USD" ? "$" : "ج.م"}</span>
                  </Button>
                ))}
              </div>

              {/* Direct Admin Access Button if Signed in as Admin */}
              {isAdmin && (
                <Button variant="premium" size="sm" asChild className="hidden sm:inline-flex items-center gap-1.5 shadow-sm">
                  <Link to="/sys-portal-9287">
                    <ShieldAlert size={14} />
                    لوحة الإدارة
                  </Link>
                </Button>
              )}

              {/* User Authentication Status */}
              {!isSignedIn ? (
                <Button variant="outline" className="auth-login-btn" onClick={() => openAuthModal("login")}>
                  <LogIn size={15} />
                  تسجيل الدخول
                </Button>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setUserDropdown(!userDropdown)}
                    className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted/80 transition-colors border border-border bg-card text-foreground"
                    aria-label="قائمة المستخدم"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm ring-2 ring-primary/20">
                      {user?.name ? user.name[0].toUpperCase() : "U"}
                    </div>
                    <ChevronDown size={14} className="text-muted-foreground ml-1" />
                  </button>

                  {/* Clean Custom User Dropdown (No Clerk watermarks) */}
                  {userDropdown && (
                    <div
                      className="absolute left-0 mt-2 w-64 rounded-xl border border-border bg-card/95 backdrop-blur-md p-2 shadow-xl z-50 text-right animate-in fade-in zoom-in-95 duration-150"
                      dir="rtl"
                    >
                      <div className="p-2.5 border-b border-border/60">
                        <div className="font-semibold text-sm text-foreground truncate">{user?.name}</div>
                        <div className="text-xs text-muted-foreground truncate" dir="ltr">{user?.email}</div>
                        {isAdmin && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold">
                            مدير النظام (Admin)
                          </span>
                        )}
                      </div>

                      <div className="py-1">
                        <Link
                          to="/dashboard"
                          onClick={() => setUserDropdown(false)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted text-foreground transition-colors"
                        >
                          <KeyRound size={14} className="text-primary" />
                          حسابي ومفاتيحي
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/sys-portal-9287"
                            onClick={() => setUserDropdown(false)}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-amber-500/10 text-amber-500 transition-colors"
                          >
                            <ShieldAlert size={14} />
                            لوحة الإدارة والمخزن
                          </Link>
                        )}
                        <Link
                          to="/balance"
                          onClick={() => setUserDropdown(false)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted text-foreground transition-colors"
                        >
                          <Sparkles size={14} className="text-primary" />
                          فحص الرصيد والاستهلاك
                        </Link>
                      </div>

                      <div className="pt-1 border-t border-border/60">
                        <button
                          type="button"
                          onClick={() => {
                            setUserDropdown(false);
                            logout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-right"
                        >
                          <LogOut size={14} />
                          تسجيل الخروج
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button variant="glass" className="telegram-button" asChild>
                <a href="https://t.me/subscnow" target="_blank" rel="noreferrer">
                  <Send />
                  دعم تيليجرام
                  <ArrowUpLeft />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label={menu ? "إغلاق القائمة" : "فتح القائمة"}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <Menu />}
              </Button>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <Button variant="glass" className="support-float" asChild>
          <a href="https://t.me/subscnow" target="_blank" rel="noreferrer">
            <img src="/subsc-robot.png" alt="دعم SubscAPI" />
            تواصل مع الدعم <ArrowUpLeft size={14} />
          </a>
        </Button>
        <footer className="site-footer">
          <div className="footer-inner">
            <Link to="/" className="brand">
              <img src="/subsc-robot.png" alt="SubscAPI Logo" />
              <span dir="ltr">
                subsc<span className="brand-api">api</span>
                <span className="brand-dot">.</span>
              </span>
            </Link>
            <p>صُنع للمطورين، ولأفكارهم الكبيرة.</p>
            <span className="footer-secure">
              <ShieldCheck size={15} /> اتصال آمن ومشفّر
            </span>
            <span dir="ltr">© 2026 SubscAPI</span>
          </div>
        </footer>
      </div>
    </CurrencyContext.Provider>
  );
}
