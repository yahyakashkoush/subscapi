export const EGP_RATE = 54;
export type Currency = "USD" | "EGP";
export const packages = [
  {
    id: "starter",
    name: "باقة المطورين",
    english: "STARTER",
    amount: 100,
    icon: "code",
    description: "بداية قوية لأفكارك ومشاريعك",
    features: [
      "رصيد كامل بقيمة 100 دولار",
      "جميع نماذج الذكاء الاصطناعي",
      "متوافق مع Cursor و Cline",
      "مفتاح خاص وآمن لمشروعك",
    ],
  },
  {
    id: "pro",
    name: "باقة المحترفين",
    english: "PRO DEVELOPER",
    amount: 200,
    icon: "zap",
    description: "قوة أكبر. إنتاجية بلا حدود.",
    features: [
      "رصيد كامل بقيمة 200 دولار",
      "جميع مميزات باقة المطورين",
      "مثالي لوكلاء البرمجة الذكية",
      "أولوية في الدعم الفني",
    ],
  },
  {
    id: "enterprise",
    name: "باقة الشركات",
    english: "ENTERPRISE",
    amount: 500,
    icon: "building",
    description: "للفرق الكبيرة والطموحات الأكبر",
    features: [
      "رصيد كامل بقيمة 500 دولار",
      "جميع مميزات باقة المحترفين",
      "تشغيل عدة وكلاء في وقت واحد",
      "دعم مخصص لفرق العمل",
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
  options: { method?: string; data?: unknown; token?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { "x-admin-token": options.token } : {}),
      },
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
