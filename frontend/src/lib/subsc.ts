export const EGP_RATE = 54;
export type Currency = "USD" | "EGP";

export type PackageItem = {
  id: string;
  name: string;
  english: string;
  amount: number;
  tier: number;
  duration?: string;
  badge?: string;
  description: string;
  models?: string[];
  modelDetails?: Array<{ id: string; name: string; inStock: boolean; stockCount: number }>;
  features: string[];
  priceUSD?: number;
  priceEGP?: number;
};

export const packages: PackageItem[] = [
  {
    id: "pkg_50",
    tier: 50,
    amount: 50,
    name: "باقة الانطلاق 50$",
    english: "STARTER 50$",
    duration: "صلاحية 7 أيام",
    badge: "تفعيل فوري",
    description: "رصيد 50$ كامل مخصص للأدوات وتطوير المشاريع السريعة.",
    models: ["GPT ASTRA", "gpt-6.1-sol"],
    features: [
      "رصيد استخدام حقيقي بقيمة 50 دولار",
      "صلاحية استخدام لمدة 7 أيام كاملة",
      "اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)",
      "متوافق مع Cursor وWindsurf وCline وRoo Code",
      "استجابة فورية وسرعة فائقة بدون انقطاع",
    ],
  },
  {
    id: "pkg_100",
    tier: 100,
    amount: 100,
    name: "باقة المحترفين 100$",
    english: "PRO 100$",
    duration: "صلاحية 30 يوم",
    badge: "الأكثر طلباً ⭐",
    description: "رصيد 100$ كامل لدعم إنجاز المشروعات البرمجية والعمل اليومي المستمر.",
    models: ["GPT ASTRA", "gpt-6.1-sol"],
    features: [
      "رصيد استخدام حقيقي بقيمة 100 دولار",
      "صلاحية استخدام لمدة 30 يوماً",
      "اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)",
      "سقف استخدام مفتوح ومعدل استدعاءات سريع",
      "دعم كامل لجميع أدوات التطوير ومكتبات OpenAI",
    ],
  },
  {
    id: "pkg_250",
    tier: 250,
    amount: 250,
    name: "باقة النخبة 250$",
    english: "ELITE 250$",
    duration: "صلاحية 30 يوم",
    badge: "أعلى أداء وأكبر حصة",
    description: "رصيد 250$ كامل للمطورين المحترفين وفرق العمل والشركات.",
    models: ["GPT ASTRA", "gpt-6.1-sol"],
    features: [
      "رصيد استخدام حقيقي ضخم بقيمة 250 دولار",
      "صلاحية استخدام لمدة 30 يوماً",
      "اختيار النموذج المناسب (ASTRA أو gpt-6.1-sol)",
      "أولوية معالجة قصوى وسرعة استجابة فائقة",
      "دعم فني مخصص على مدار الساعة",
    ],
  },
  {
    id: "pkg_500",
    tier: 500,
    amount: 500,
    name: "باقة الشركات والمؤسسات 500$",
    english: "ENTERPRISE 500$",
    duration: "صلاحية 30 يوم",
    badge: "أعلى سعة واستقرار 👑",
    description: "رصيد 500$ كامل مخصص للشركات وتوليد كميات هائلة من الأكواد وبناء المنتجات.",
    models: ["GPT ASTRA", "gpt-6.1-sol"],
    features: [
      "رصيد استخدام هائل بقيمة 500 دولار",
      "صلاحية استخدام كاملة لمدة 30 يوماً",
      "أقصى سرعة تدفق للبيانات بدون أي قيود أو حدود",
      "قنوات مخصصة تضمن عدم التوقف أثناء أقصى ضغط للعمل",
      "دعم فني خاص على مدار الساعة وأولوية قصوى",
    ],
  },
];
export function price(amount: number, currency: Currency) {
  return (amount * (currency === "EGP" ? EGP_RATE : 1)).toLocaleString("en-US");
}
export const apiBase =
  (typeof window !== "undefined" &&
    window.location.origin &&
    !window.location.origin.includes("localhost") &&
    window.location.origin) ||
  import.meta.env["VITE_SUBSC_API_URL"] ||
  "https://ai.subsc.tech";
export async function api<T>(
  path: string,
  options: {
    method?: string;
    data?: unknown;
    token?: string;
    clerkEmail?: string;
    userEmail?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let savedToken = options.token;
    let savedEmail = options.userEmail || options.clerkEmail;
    let savedUserId = "";

    if (typeof window !== "undefined") {
      try {
        if (!savedToken) savedToken = localStorage.getItem("subsc_auth_token") || undefined;
        const savedUserStr = localStorage.getItem("subsc_user");
        if (savedUserStr) {
          const u = JSON.parse(savedUserStr);
          if (!savedEmail && u.email) savedEmail = u.email;
          if (u.id) savedUserId = u.id;
        }
      } catch {}
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(savedToken ? { "Authorization": `Bearer ${savedToken}`, "x-user-token": savedToken } : {}),
      ...(savedEmail ? { "x-user-email": savedEmail, "x-clerk-user-email": savedEmail } : {}),
      ...(savedUserId ? { "x-user-id": savedUserId, "x-clerk-user-id": savedUserId } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: headers,
      ...(options.data ? { body: JSON.stringify(options.data) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || result.error || "تعذر إتمام الطلب. حاول مرة أخرى.");
    return result as T;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw new Error("خدمة API غير متصلة حالياً. يرجى المحاولة بعد ربط الخدمة.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function metadata(title: string, description: string) {
  return {
    meta: [
      { title: `${title} | SubscAPI` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | SubscAPI` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
