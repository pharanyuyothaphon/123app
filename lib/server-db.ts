import "server-only";

type AdminRequestOptions = RequestInit & { headers?: HeadersInit };

type ErrorPayload = {
  message?: string;
  error_description?: string;
  hint?: string;
  details?: string;
  msg?: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey ? { url, serviceKey } : null;
}

export function isServerDatabaseConfigured() {
  return Boolean(config());
}

export async function adminRequest<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const settings = config();
  if (!settings) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local");

  const { headers, ...requestOptions } = options;
  const response = await fetch(`${settings.url}${path}`, {
    ...requestOptions,
    headers: {
      apikey: settings.serviceKey,
      Authorization: `Bearer ${settings.serviceKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null
      ? (() => {
          const error = payload as ErrorPayload;
          return error.message || error.error_description || error.msg || error.hint || error.details;
        })()
      : null;
    throw new Error(detail || `คำขอฐานข้อมูลไม่สำเร็จ (${response.status})`);
  }

  return payload as T;
}

export function serverRpc<T>(name: string, body: Record<string, unknown>) {
  return adminRequest<T>(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
