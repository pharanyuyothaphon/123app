import type {
  AppSession,
  DashboardSnapshot,
  DeliveryTracking,
  Order,
  Product,
  Retailer,
  Role,
} from "@/lib/types";

type LoginResult = {
  redirectTo: string;
  role: Role;
  session: AppSession;
  message?: string;
};

type ErrorPayload = { message?: string };

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null
      ? (payload as ErrorPayload).message
      : null;
    throw new Error(message || "ไม่สามารถเชื่อมต่อกับระบบได้");
  }

  return payload as T;
}

export async function signInWithPhone(phone: string, password: string) {
  const payload = await apiRequest<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  if (!payload.session?.user?.id || !payload.redirectTo) {
    throw new Error(payload.message || "เข้าสู่ระบบไม่สำเร็จ");
  }
  return payload;
}

export async function registerRetailer(phone: string, shopName: string, password: string) {
  return apiRequest<{ ok: true; profileId: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ phone, shopName, password }),
  });
}

export async function signOut() {
  await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function getProfile() {
  const payload = await apiRequest<{ profile: Retailer }>("/api/auth/session");
  return payload.profile || null;
}

export async function fetchDashboardSnapshot(
  _session: AppSession,
  _role: Role,
): Promise<DashboardSnapshot> {
  void _session;
  void _role;
  return apiRequest<DashboardSnapshot>("/api/dashboard");
}

export async function addProduct(
  _session: AppSession,
  product: Pick<Product, "name" | "price_box" | "price_pack" | "stock">,
) {
  return apiRequest<Product>("/api/products", {
    method: "POST",
    body: JSON.stringify(product),
  });
}

export async function deleteProduct(_session: AppSession, productId: string) {
  await apiRequest<{ ok: true }>(`/api/products?id=${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}

export async function adjustStock(_session: AppSession, productId: string, delta: number) {
  return apiRequest<{ stock: number }>("/api/stock", {
    method: "POST",
    body: JSON.stringify({ productId, delta }),
  });
}

export async function createRetailerOrder(
  _session: AppSession,
  items: Array<{ product_id: string; quantity_box: number; quantity_pack: number }>,
) {
  const payload = await apiRequest<{ orderId: string }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return payload.orderId;
}

export async function updateDeliveryStatus(
  _session: AppSession,
  orderId: string,
  status: Order["status"],
) {
  const payload = await apiRequest<{ order: Order }>("/api/delivery/status", {
    method: "POST",
    body: JSON.stringify({ orderId, status }),
  });
  return payload.order;
}

export async function saveDeliveryTracking(
  _session: AppSession,
  orderId: string,
  latitude: number,
  longitude: number,
) {
  const payload = await apiRequest<{ tracking: DeliveryTracking }>("/api/delivery/tracking", {
    method: "POST",
    body: JSON.stringify({ orderId, latitude, longitude }),
  });
  return payload.tracking;
}
