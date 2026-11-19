import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Send, ShieldCheck, ArrowUpLeft, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import robot from "@/assets/subsc-robot-original-transparent.png.asset.json";
import type { Currency } from "@/lib/subsc";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";

const CurrencyContext = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({
  currency: "USD",
  setCurrency: () => {},
});
export const useCurrency = () => useContext(CurrencyContext);
export function SubscShell({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [menu, setMenu] = useState(false);
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
              <SignedIn>
                <Link to="/dashboard" onClick={() => setMenu(false)} className="nav-dashboard-link">
                  <Sparkles size={14} className="inline ml-1 text-primary" />
                  حسابي ومفاتيحي
                </Link>
              </SignedIn>
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

              {/* User Authentication Status */}
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="outline" className="auth-login-btn">
                    <LogIn size={15} />
                    تسجيل الدخول
                  </Button>
                </SignInButton>
              </SignedOut>

              <SignedIn>
                <div className="flex items-center gap-2" dir="ltr">
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox: "w-8 h-8 rounded-full ring-2 ring-primary/30"
                      }
                    }}
                  />
                </div>
              </SignedIn>

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
