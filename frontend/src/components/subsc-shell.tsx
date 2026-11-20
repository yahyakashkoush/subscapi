import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Send, ShieldCheck, ArrowUpLeft, LogIn, Sparkles, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/subsc";
import { useAuth } from "@/lib/auth";
import { SignInButton, UserButton } from "@clerk/react";

const CurrencyContext = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({
  currency: "USD",
  setCurrency: () => {},
});
export const useCurrency = () => useContext(CurrencyContext);

export function SubscShell({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [menu, setMenu] = useState(false);
  const { isSignedIn, isAdmin } = useAuth();

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
                <Link
                  to="/sys-portal-9287"
                  onClick={() => setMenu(false)}
                  className="nav-admin-link text-amber-500 font-bold border border-amber-500/30 rounded-full px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                >
                  <ShieldAlert size={14} className="text-amber-500" />
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

              {/* Clerk User Authentication */}
              {!isSignedIn ? (
                <SignInButton mode="modal">
                  <Button variant="outline" className="auth-login-btn">
                    <LogIn size={15} />
                    تسجيل الدخول
                  </Button>
                </SignInButton>
              ) : (
                <div className="flex items-center gap-2" dir="ltr">
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      layout: {
                        unsafe_disableDevelopmentModeWarnings: true,
                        logoPlacement: "none",
                      },
                      elements: {
                        avatarBox: "w-8 h-8 rounded-full ring-2 ring-primary/30",
                        userButtonPopoverFooter: "!hidden hidden !h-0 !p-0 !m-0",
                        footer: "!hidden hidden !h-0 !p-0 !m-0",
                        footerAction: "!hidden hidden !h-0 !p-0 !m-0",
                        devModeTag: "!hidden hidden !h-0 !p-0 !m-0",
                        badge: "!hidden hidden !h-0 !p-0 !m-0",
                        developmentModeBadge: "!hidden hidden !h-0 !p-0 !m-0",
                      },
                    }}
                  >
                    <UserButton.MenuItems>
                      {isAdmin && (
                        <UserButton.Link
                          label="لوحة تحكم الإدارة"
                          labelIcon={<ShieldCheck size={16} />}
                          href="/sys-portal-9287"
                        />
                      )}
                      <UserButton.Link
                        label="حسابي ومفاتيحي"
                        labelIcon={<Sparkles size={16} />}
                        href="/dashboard"
                      />
                    </UserButton.MenuItems>
                  </UserButton>
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
