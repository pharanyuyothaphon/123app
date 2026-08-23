"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { roleDashboardPath } from "@/lib/role-routes";
import {
  addProduct,
  adjustStock,
  createRetailerOrder,
  deleteProduct,
  fetchDashboardSnapshot,
  getProfile,
  saveDeliveryTracking,
  signOut,
  updateDeliveryStatus,
} from "@/lib/supabase";
import type {
  AppSession,
  CartLine,
  DashboardSnapshot,
  DashboardView,
  DeliveryTracking,
  Order,
  OrderStatus,
  Product,
  Retailer,
  Role,
} from "@/lib/types";

type CartState = Record<string, { boxes: number; packs: number }>;
type ProductDraft = { name: string; priceBox: string; pricePack: string; stock: string };
type SharedLocation = { orderId: string; latitude: number; longitude: number; sentAt: number };

const LOCATION_MIN_SEND_GAP_MS = 5_000;
const LOCATION_SEND_INTERVAL_MS = 15_000;
const LOCATION_MIN_DISTANCE_METERS = 25;
const RETAILER_CART_STORAGE_PREFIX = "123-commerce:retailer-cart:";

const roleMeta: Record<Role, { label: string; title: string; description: string; glyph: string; accent: string }> = {
  OWNER: {
    label: "OWNER",
    title: "เจ้าของร้าน",
    description: "ภาพรวมคลังสินค้า ออเดอร์ และการจัดส่ง",
    glyph: "◈",
    accent: "bg-[#fff0e9] text-[#c45c37]",
  },
  ADMIN: {
    label: "ADMIN",
    title: "แอดมินคลัง",
    description: "จัดการจำนวนสินค้าทั้งหมดในระบบ",
    glyph: "▦",
    accent: "bg-[#e5f3ed] text-[#0e715c]",
  },
  EMPLOYEE: {
    label: "EMPLOYEE",
    title: "พนักงานจัดการสินค้า",
    description: "รับงาน จัดสินค้า และส่งพิกัดระหว่างนำส่ง",
    glyph: "⌁",
    accent: "bg-[#eef0fc] text-[#5965aa]",
  },
  RETAILER: {
    label: "RETAILER",
    title: "ผู้ค้าปลีก",
    description: "เลือกสินค้า สั่งซื้อ และติดตามการจัดส่ง",
    glyph: "◫",
    accent: "bg-[#fff5dc] text-[#a57316]",
  },
};

const statusMeta: Record<OrderStatus, { label: string; className: string; dot: string }> = {
  PENDING: { label: "รอจัดสินค้า", className: "bg-[#fff4d9] text-[#96650d]", dot: "bg-[#e1a62a]" },
  PACKED: { label: "จัดสินค้าเสร็จแล้ว", className: "bg-[#e7f1fc] text-[#2e6a9e]", dot: "bg-[#4d8bc1]" },
  DELIVERING: { label: "กำลังนำส่ง", className: "bg-[#eeeefc] text-[#5b60a3]", dot: "bg-[#787ed2]" },
  COMPLETED: { label: "จัดส่งสำเร็จ", className: "bg-[#e5f5eb] text-[#207653]", dot: "bg-[#37ab75]" },
};

const productTones = [
  "bg-[#f9dfcf] text-[#bd613d]",
  "bg-[#d9eaeb] text-[#32757a]",
  "bg-[#efe3bb] text-[#8b6a18]",
  "bg-[#dfdff2] text-[#5d60a0]",
  "bg-[#dceee5] text-[#337a61]",
];

const navByRole: Record<Role, Array<{ view: DashboardView; label: string; glyph: string }>> = {
  OWNER: [
    { view: "overview", label: "คลังสินค้าทั้งหมด", glyph: "▦" },
    { view: "orders", label: "รายการสินค้าร้านค้า", glyph: "☷" },
    { view: "add-product", label: "เพิ่มสินค้า", glyph: "+" },
    { view: "tracking", label: "ติดตามพนักงาน", glyph: "⌁" },
  ],
  ADMIN: [{ view: "overview", label: "จัดการคลังสินค้า", glyph: "▦" }],
  EMPLOYEE: [
    { view: "overview", label: "รายการตามร้านค้า", glyph: "◫" },
    { view: "tracking", label: "แผนที่การส่ง", glyph: "⌁" },
  ],
  RETAILER: [
    { view: "overview", label: "เลือกสินค้า", glyph: "▦" },
    { view: "cart", label: "ตะกร้าของฉัน", glyph: "☷" },
    { view: "tracking", label: "พิกัดพนักงาน", glyph: "⌁" },
  ],
};

const viewTitle: Record<DashboardView, { title: string; subtitle: string }> = {
  overview: { title: "ภาพรวมการทำงาน", subtitle: "ข้อมูลล่าสุดที่ต้องจัดการในวันนี้" },
  orders: { title: "รายการสินค้าร้านค้า", subtitle: "รวมรายการที่ผู้ค้าปลีกเลือกไว้ในแต่ละคำสั่งซื้อ" },
  "add-product": { title: "เพิ่มสินค้าเข้าคลัง", subtitle: "กำหนดราคากล่องและราคาแพ็คให้พร้อมสั่งซื้อ" },
  tracking: { title: "แผนที่การจัดส่ง", subtitle: "ติดตามตำแหน่งพนักงานและสถานะการนำส่ง" },
  cart: { title: "ตะกร้าสินค้าของฉัน", subtitle: "ตรวจสอบรายการและยอดรวมก่อนยืนยันคำสั่งซื้อ" },
};

const createEmptyDraft = (): ProductDraft => ({ name: "", priceBox: "", pricePack: "", stock: "0" });

function retailerCartStorageKey(retailerId: string) {
  return `${RETAILER_CART_STORAGE_PREFIX}${retailerId}`;
}

function restoreCart(rawValue: string | null): CartState {
  if (!rawValue) return {};

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const cart: CartState = {};
    for (const [productId, rawAmount] of Object.entries(parsed as Record<string, unknown>)) {
      if (!rawAmount || typeof rawAmount !== "object" || Array.isArray(rawAmount)) continue;
      const amount = rawAmount as Record<string, unknown>;
      const boxes = typeof amount.boxes === "number" && Number.isFinite(amount.boxes)
        ? Math.max(0, Math.floor(amount.boxes))
        : 0;
      const packs = typeof amount.packs === "number" && Number.isFinite(amount.packs)
        ? Math.max(0, Math.floor(amount.packs))
        : 0;

      if (boxes > 0 || packs > 0) cart[productId] = { boxes, packs };
    }
    return cart;
  } catch {
    return {};
  }
}

function price(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function stockLabel(stock: number) {
  if (stock <= 12) return { text: "ต้องเติม", className: "bg-[#fff0e9] text-[#c45c37]" };
  if (stock <= 24) return { text: "ใกล้หมด", className: "bg-[#fff5da] text-[#9f7017]" };
  return { text: "พร้อมขาย", className: "bg-[#e6f5eb] text-[#227654]" };
}

function productTone(id: string) {
  const numeric = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return productTones[numeric % productTones.length];
}

function distanceInMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const distance =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(distance), Math.sqrt(1 - distance));
}

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง โปรดเปิดสิทธิ์ Location ในเบราว์เซอร์";
  if (error.code === error.POSITION_UNAVAILABLE) return "อุปกรณ์ยังระบุตำแหน่งไม่ได้ โปรดเปิด GPS และเชื่อมต่ออินเทอร์เน็ต";
  if (error.code === error.TIMEOUT) return "ใช้เวลาค้นหาตำแหน่งนานเกินไป โปรดลองใหม่อีกครั้ง";
  return "ไม่สามารถรับตำแหน่งปัจจุบันได้";
}

function mapEmbedUrl(latitude: number, longitude: number) {
  const latitudeSpan = 0.008;
  const longitudeSpan = 0.012;
  const bounds = [longitude - longitudeSpan, latitude - latitudeSpan, longitude + longitudeSpan, latitude + latitudeSpan]
    .map((value) => value.toFixed(6))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds)}&layer=mapnik&marker=${encodeURIComponent(`${latitude.toFixed(6)},${longitude.toFixed(6)}`)}`;
}

function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function CommerceDashboard({ expectedRole }: { expectedRole: Role }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [identity, setIdentity] = useState<Retailer | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartState>({});
  const [cartReadyFor, setCartReadyFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(createEmptyDraft);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeTrackingOrderId, setActiveTrackingOrderId] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const trackingWatchIdRef = useRef<number | null>(null);
  const lastSharedLocationRef = useRef<SharedLocation | null>(null);
  const trackingRequestInFlightRef = useRef(false);
  const cartStorageKey = role === "RETAILER" && identity?.id ? retailerCartStorageKey(identity.id) : null;

  const applySnapshot = useCallback((snapshot: DashboardSnapshot) => {
    setProducts([...snapshot.products].sort((a, b) => a.stock - b.stock));
    setOrders(snapshot.orders);
    setRetailers(snapshot.retailers);
  }, []);

  const refreshLiveData = useCallback(
    async (activeSession: AppSession, activeRole: Role) => {
      const snapshot = await fetchDashboardSnapshot(activeSession, activeRole);
      applySnapshot(snapshot);
    },
    [applySnapshot],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_600);
  }, []);

  const stopLiveLocationTracking = useCallback((showNotification = true) => {
    if (trackingWatchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(trackingWatchIdRef.current);
    }
    trackingWatchIdRef.current = null;
    lastSharedLocationRef.current = null;
    trackingRequestInFlightRef.current = false;
    setActiveTrackingOrderId(null);
    if (showNotification) notify("หยุดแชร์ตำแหน่งแล้ว");
  }, [notify]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const profile = await getProfile();
        if (!profile?.role) throw new Error("ไม่พบสิทธิ์ของผู้ใช้");
        if (profile.role !== expectedRole) {
          router.replace(roleDashboardPath[profile.role]);
          return;
        }
        const activeSession: AppSession = {
          user: { id: profile.id, phone: profile.phone || null },
        };
        const snapshot = await fetchDashboardSnapshot(activeSession, profile.role);
        if (cancelled) return;
        applySnapshot(snapshot);
        setSession(activeSession);
        setIdentity(profile);
        setRole(profile.role);
        setLoading(false);
      } catch {
        router.replace("/login");
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, expectedRole, router]);

  useEffect(() => {
    if (!session || !role) return;
    const interval = window.setInterval(() => {
      void refreshLiveData(session, role).catch(() => undefined);
    }, role === "OWNER" || role === "RETAILER" ? 10_000 : 15_000);
    return () => window.clearInterval(interval);
  }, [refreshLiveData, role, session]);

  useEffect(() => {
    if (!cartStorageKey) {
      setCart({});
      setCartReadyFor(null);
      return;
    }

    try {
      setCart(restoreCart(window.localStorage.getItem(cartStorageKey)));
    } catch {
      setCart({});
    }
    setCartReadyFor(cartStorageKey);
  }, [cartStorageKey]);

  useEffect(() => {
    if (!cartStorageKey || cartReadyFor !== cartStorageKey) return;

    try {
      if (Object.keys(cart).length) {
        window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      } else {
        window.localStorage.removeItem(cartStorageKey);
      }
    } catch {
      // Browser privacy settings may disable local storage; ordering still works normally.
    }
  }, [cart, cartReadyFor, cartStorageKey]);

  useEffect(() => () => stopLiveLocationTracking(false), [stopLiveLocationTracking]);

  useEffect(() => {
    if (role === "EMPLOYEE" && retailers.length && !selectedRetailerId) {
      setSelectedRetailerId(retailers[0].id);
    }
  }, [role, retailers, selectedRetailerId]);

  const matchingProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th-TH");
    return [...products]
      .filter((product) => product.name.toLocaleLowerCase("th-TH").includes(normalized))
      .sort((a, b) => a.stock - b.stock);
  }, [products, query]);

  const cartLines = useMemo<CartLine[]>(() => {
    return Object.entries(cart)
      .map(([productId, amount]) => {
        const product = products.find((item) => item.id === productId);
        return product && (amount.boxes > 0 || amount.packs > 0)
          ? { product, boxes: amount.boxes, packs: amount.packs }
          : null;
      })
      .filter((line): line is CartLine => line !== null);
  }, [cart, products]);

  const cartTotal = useMemo(
    () => cartLines.reduce((total, line) => total + line.boxes * line.product.price_box + line.packs * (line.product.price_pack || 0), 0),
    [cartLines],
  );
  const cartCount = useMemo(() => cartLines.reduce((total, line) => total + line.boxes + line.packs, 0), [cartLines]);
  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "PENDING").length, [orders]);
  const deliveringOrders = useMemo(() => orders.filter((order) => order.status === "DELIVERING").length, [orders]);
  const lowStock = useMemo(() => products.filter((product) => product.stock <= 20), [products]);

  const updateLocalOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status, assigned_employee_id: session?.user.id || "e-1" } : order)));
  };

  const handleLogout = async () => {
    setBusyAction("logout");
    try {
      stopLiveLocationTracking(false);
      await signOut();
    } finally {
      router.replace("/login");
    }
  };

  const changeStock = async (product: Product, delta: number) => {
    if (product.stock + delta < 0) return;
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    const previous = products;
    setProducts((current) => current.map((item) => (item.id === product.id ? { ...item, stock: Math.max(0, item.stock + delta) } : item)).sort((a, b) => a.stock - b.stock));

    setBusyAction(`stock-${product.id}`);
    try {
      await adjustStock(session, product.id, delta);
      notify("อัปเดตจำนวนสินค้าแล้ว");
    } catch (error) {
      setProducts(previous);
      notify(error instanceof Error ? error.message : "อัปเดตจำนวนสินค้าไม่สำเร็จ");
    } finally {
      setBusyAction(null);
    }
  };

  const removeProduct = async (product: Product) => {
    if (!window.confirm(`ต้องการลบ “${product.name}” ออกจากคลังหรือไม่?`)) return;
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    const previous = products;
    setProducts((current) => current.filter((item) => item.id !== product.id));
    setBusyAction(`delete-${product.id}`);
    try {
      await deleteProduct(session, product.id);
      notify("ลบสินค้าออกจากคลังแล้ว");
    } catch (error) {
      setProducts(previous);
      notify(error instanceof Error ? error.message : "ลบสินค้าไม่สำเร็จ");
    } finally {
      setBusyAction(null);
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const priceBox = Number(draft.priceBox);
    const pricePack = draft.pricePack.trim() ? Number(draft.pricePack) : null;
    const stock = Math.max(0, Number(draft.stock || 0));
    if (!draft.name.trim() || !Number.isFinite(priceBox) || priceBox < 0 || (pricePack !== null && (!Number.isFinite(pricePack) || pricePack < 0))) {
      notify("กรุณาระบุชื่อสินค้าและราคากล่องให้ถูกต้อง");
      return;
    }

    const optimistic: Product = {
      id: `local-${Date.now()}`,
      name: draft.name.trim(),
      price_box: priceBox,
      price_pack: pricePack,
      stock,
      created_at: new Date().toISOString(),
    };
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    setBusyAction("add-product");
    try {
      const created = await addProduct(session, {
        name: optimistic.name,
        price_box: optimistic.price_box,
        price_pack: optimistic.price_pack,
        stock: optimistic.stock,
      });
      setProducts((current) => [...current, created || optimistic].sort((a, b) => a.stock - b.stock));
      setDraft(createEmptyDraft());
      notify("เพิ่มสินค้าเข้าคลังเรียบร้อยแล้ว");
      setActiveView("overview");
    } catch (error) {
      notify(error instanceof Error ? error.message : "เพิ่มสินค้าไม่สำเร็จ");
    } finally {
      setBusyAction(null);
    }
  };

  const changeCart = (product: Product, unit: "boxes" | "packs", delta: number) => {
    if (unit === "packs" && product.price_pack === null) return;
    setCart((current) => {
      const present = current[product.id] || { boxes: 0, packs: 0 };
      const next = { ...present, [unit]: Math.max(0, present[unit] + delta) };
      if (next.boxes === 0 && next.packs === 0) {
        const { [product.id]: removed, ...rest } = current;
        void removed;
        return rest;
      }
      return { ...current, [product.id]: next };
    });
  };

  const checkout = async () => {
    if (!cartLines.length) {
      notify("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setBusyAction("checkout");
    try {
      const orderId = await createRetailerOrder(
        session,
        cartLines.map((line) => ({ product_id: line.product.id, quantity_box: line.boxes, quantity_pack: line.packs })),
      );
      setCart({});
      setSelectedOrderId(orderId);
      setActiveView("cart");

      try {
        if (role) await refreshLiveData(session, role);
        notify("ยืนยันคำสั่งซื้อแล้ว ดูรายละเอียดได้ในหน้าตะกร้า");
      } catch {
        notify("ยืนยันคำสั่งซื้อแล้ว แต่ยังโหลดรายละเอียดล่าสุดไม่สำเร็จ โปรดเปิดตะกร้าอีกครั้ง");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "ไม่สามารถยืนยันคำสั่งซื้อได้");
    } finally {
      setBusyAction(null);
    }
  };

  const changeDeliveryStatus = async (order: Order, status: OrderStatus) => {
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (status === "COMPLETED" && activeTrackingOrderId === order.id) {
      stopLiveLocationTracking(false);
    }
    updateLocalOrderStatus(order.id, status);
    setBusyAction(`order-${order.id}`);
    try {
      await updateDeliveryStatus(session, order.id, status);
      notify(statusMeta[status].label);
    } catch (error) {
      updateLocalOrderStatus(order.id, order.status);
      notify(error instanceof Error ? error.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyAction(null);
    }
  };

  const commitLocation = useCallback(async (
    order: Order,
    latitude: number,
    longitude: number,
    silent = false,
  ) => {
    if (!session) {
      if (!silent) notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return false;
    }
    const nextTracking: DeliveryTracking = {
      order_id: order.id,
      employee_id: session.user.id,
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
      employee: { id: session.user.id, shop_name: identity?.shop_name || "พนักงานจัดส่ง" },
    };
    setOrders((current) => current.map((item) => (
      item.id === order.id ? { ...item, tracking: nextTracking } : item
    )));
    try {
      await saveDeliveryTracking(session, order.id, latitude, longitude);
      setLocationError(null);
      if (!silent) notify("ส่งพิกัดให้เจ้าของร้านและผู้ค้าปลีกแล้ว");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "ส่งพิกัดไม่สำเร็จ";
      setLocationError(message);
      if (!silent) notify(message);
      return false;
    }
  }, [identity?.shop_name, notify, session]);

  const startLiveLocationTracking = useCallback((order: Order) => {
    if (!session) {
      notify("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (activeTrackingOrderId === order.id && trackingWatchIdRef.current !== null) {
      stopLiveLocationTracking();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับการแชร์ตำแหน่ง");
      notify("อุปกรณ์นี้ไม่รองรับการแชร์ตำแหน่ง");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setLocationError("การแชร์ตำแหน่งต้องเปิดผ่าน HTTPS");
      notify("การแชร์ตำแหน่งต้องเปิดผ่าน HTTPS");
      return;
    }

    stopLiveLocationTracking(false);
    setLocationError(null);
    setActiveTrackingOrderId(order.id);
    let firstPositionSaved = false;
    let watchId: number | null = null;

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const now = Date.now();
        const previous = lastSharedLocationRef.current;
        const sameOrder = previous?.orderId === order.id;
        const elapsed = sameOrder ? now - previous.sentAt : Number.POSITIVE_INFINITY;
        const moved = sameOrder
          ? distanceInMeters(previous.latitude, previous.longitude, latitude, longitude)
          : Number.POSITIVE_INFINITY;
        const waitForMinimumGap = sameOrder && elapsed < LOCATION_MIN_SEND_GAP_MS;
        const positionNeedsSaving = !sameOrder || elapsed >= LOCATION_SEND_INTERVAL_MS || moved >= LOCATION_MIN_DISTANCE_METERS;

        if (waitForMinimumGap || !positionNeedsSaving || trackingRequestInFlightRef.current) return;

        lastSharedLocationRef.current = { orderId: order.id, latitude, longitude, sentAt: now };
        trackingRequestInFlightRef.current = true;
        void commitLocation(order, latitude, longitude, true)
          .then((saved) => {
            if (saved && !firstPositionSaved) {
              firstPositionSaved = true;
              notify("เริ่มแชร์ตำแหน่งจริงให้เจ้าของร้านและผู้ค้าปลีกแล้ว");
            }
          })
          .finally(() => {
            trackingRequestInFlightRef.current = false;
          });
      },
      (error) => {
        if (watchId === null || trackingWatchIdRef.current !== watchId) return;
        stopLiveLocationTracking(false);
        const message = locationErrorMessage(error);
        setLocationError(message);
        notify(message);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
    trackingWatchIdRef.current = watchId;
    notify("กำลังขอสิทธิ์และค้นหาตำแหน่งปัจจุบัน...");
  }, [activeTrackingOrderId, commitLocation, notify, session, stopLiveLocationTracking]);

  if (loading || !role) {
    return <LoadingScreen />;
  }

  const meta = roleMeta[role];
  const navItems = navByRole[role];
  const currentView = viewTitle[activeView];
  const currentOrder = orders.find((order) => order.id === selectedOrderId) || orders[0] || null;
  const allRetailers: Retailer[] = retailers.length
    ? retailers
    : Array.from(
        new Map(
          orders.map((order) => [
            order.retailer_id,
            order.retailer || ({ id: order.retailer_id, shop_name: "ร้านค้าที่ลงทะเบียน", role: "RETAILER" } as Retailer),
          ]),
        ).values(),
      );

  const renderOwner = () => {
    if (activeView === "orders") {
      return (
        <div className="grid gap-5 xl:grid-cols-[1.03fr_.97fr]">
          <OrderList orders={orders} selectedId={currentOrder?.id || null} onSelect={setSelectedOrderId} />
          <OrderDetail order={currentOrder} />
        </div>
      );
    }
    if (activeView === "add-product") {
      return <ProductForm draft={draft} onChange={setDraft} onSubmit={submitProduct} pending={busyAction === "add-product"} />;
    }
    if (activeView === "tracking") {
      return <TrackingWorkspace orders={orders} title="สถานะการส่งของพนักงาน" caption="ตำแหน่งล่าสุดที่พนักงานแชร์ให้เจ้าของร้านและผู้ค้าปลีก" />;
    }
    return (
      <>
        <MetricRow
          metrics={[
            { label: "รายการสินค้าทั้งหมด", value: products.length.toString(), note: "เรียงสินค้าน้อยสุดก่อน", glyph: "▦", tone: "bg-[#e5f3ed] text-[#0e725e]" },
            { label: "สินค้าใกล้หมด", value: lowStock.length.toString(), note: "ควรตรวจสอบและเติมสินค้า", glyph: "!", tone: "bg-[#fff0e9] text-[#c45c37]" },
            { label: "กำลังนำส่ง", value: deliveringOrders.toString(), note: "ติดตามพนักงานได้ทันที", glyph: "⌁", tone: "bg-[#eeeefc] text-[#5963a4]" },
          ]}
        />
        <div className="mt-5 grid gap-5 2xl:grid-cols-[1.2fr_.8fr]">
          <InventoryPanel
            title="สินค้าในคลัง"
            caption="เรียงจากจำนวนคงเหลือน้อยไปมาก"
            products={matchingProducts}
            query={query}
            onQueryChange={setQuery}
            onAdjust={changeStock}
            onDelete={removeProduct}
            busyAction={busyAction}
            owner
          />
          <aside className="space-y-5">
            <QuickActionCard
              title="การจัดส่งวันนี้"
              text={deliveringOrders ? `มี ${deliveringOrders} ร้านที่พนักงานกำลังนำส่ง` : "ยังไม่มีรายการที่อยู่ระหว่างนำส่ง"}
              action="ตรวจสอบสถานะการส่ง"
              glyph="⌁"
              tone="bg-[#0e4d43]"
              onClick={() => setActiveView("tracking")}
            />
            <div className="rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-black text-[#183d34]">แจ้งเตือนสินค้าใกล้หมด</p><p className="mt-1 text-xs leading-5 text-[#71867e]">ตรวจสอบก่อนสินค้าหมดหน้าร้าน</p></div>
                <span className="rounded-xl bg-[#fff0e9] px-2.5 py-1 text-[11px] font-black text-[#c45c37]">{lowStock.length} รายการ</span>
              </div>
              <div className="mt-4 space-y-3">
                {lowStock.slice(0, 4).map((product) => (
                  <button key={product.id} onClick={() => setQuery(product.name)} className="flex w-full items-center gap-3 rounded-xl px-1 text-left transition hover:bg-[#f7faf8]">
                    <ProductMark product={product} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#456157]">{product.name}</span>
                    <span className="text-xs font-black text-[#c45c37]">{product.stock}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setQuery("")} className="mt-5 text-xs font-extrabold text-[#0e715c]">ดูสินค้าทั้งหมด →</button>
            </div>
          </aside>
        </div>
      </>
    );
  };

  const renderAdmin = () => (
    <>
      <MetricRow
        metrics={[
          { label: "สินค้าทั้งระบบ", value: products.length.toString(), note: "พร้อมให้ผู้ค้าปลีกเลือก", glyph: "▦", tone: "bg-[#e5f3ed] text-[#0e725e]" },
          { label: "ต้องเติมสต็อก", value: lowStock.length.toString(), note: "น้อยกว่าหรือเท่ากับ 20", glyph: "!", tone: "bg-[#fff0e9] text-[#c45c37]" },
          { label: "รอจัดสินค้า", value: pendingOrders.toString(), note: "คำสั่งซื้อที่เพิ่งเข้าระบบ", glyph: "☷", tone: "bg-[#fff5da] text-[#9d6c14]" },
        ]}
      />
      <div className="mt-5 grid gap-5 2xl:grid-cols-[1.2fr_.8fr]">
        <InventoryPanel
          title="จัดการจำนวนสินค้า"
          caption="กด − หรือ + เพื่ออัปเดตสต็อกในคลัง"
          products={matchingProducts}
          query={query}
          onQueryChange={setQuery}
          onAdjust={changeStock}
          busyAction={busyAction}
        />
        <div className="rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e5f3ed] text-lg font-black text-[#0e725e]">▦</span>
          <h3 className="mt-5 text-xl font-black tracking-tight text-[#173d34]">คลังเดียว ข้อมูลเดียว</h3>
          <p className="mt-2 text-sm leading-6 text-[#667d73]">จำนวนที่อัปเดตที่นี่จะแสดงให้เจ้าของร้านและผู้ค้าปลีกเห็นทันทีเมื่อระบบเชื่อม Supabase</p>
          <div className="mt-6 rounded-2xl bg-[#f4f8f6] p-4">
            <p className="text-[11px] font-black tracking-[.1em] text-[#5d7a6f]">สรุปสต็อก</p>
            <div className="mt-3 flex items-end justify-between"><span className="text-sm font-bold text-[#567168]">รวมทุกหน่วย</span><span className="text-3xl font-black text-[#0e4d43]">{products.reduce((total, product) => total + product.stock, 0).toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </>
  );

  const renderEmployee = () => {
    if (activeView === "tracking") {
      return <TrackingWorkspace orders={orders} title="แผนที่การส่ง" caption="พิกัดที่บันทึกไว้จะส่งให้เจ้าของร้านและผู้ค้าปลีกทันที" />;
    }
    const selectedRetailer = allRetailers.find((item) => item.id === selectedRetailerId) || allRetailers[0] || null;
    const retailerOrders = selectedRetailer ? orders.filter((order) => order.retailer_id === selectedRetailer.id) : [];
    const selectedStoreOrder = retailerOrders.find((order) => order.id === selectedOrderId) || retailerOrders[0] || null;
    return (
      <div className="grid gap-5 2xl:grid-cols-[320px_1fr]">
        <section className="rounded-[25px] border border-[#dbe8e2] bg-white p-4 shadow-sm">
          <div className="px-1 pb-3"><p className="text-sm font-black text-[#193f36]">ร้านค้าในระบบ</p><p className="mt-1 text-xs text-[#72887e]">รายชื่อร้านค้าที่มีในระบบ</p></div>
          <div className="max-h-[610px] space-y-2 overflow-y-auto pr-1">
            {allRetailers.map((retailer) => {
              const currentCount = orders.filter((order) => order.retailer_id === retailer.id && order.status !== "COMPLETED").length;
              const active = retailer.id === selectedRetailer?.id;
              return (
                <button key={retailer.id} onClick={() => { setSelectedRetailerId(retailer.id); setSelectedOrderId(null); }} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? "bg-[#e4f3ed]" : "hover:bg-[#f6faf8]"}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${active ? "bg-[#0e4d43] text-white" : "bg-[#f2f5f3] text-[#497167]"}`}>{retailer.shop_name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#264c42]">{retailer.shop_name}</span><span className="mt-0.5 block text-[11px] font-semibold text-[#7a9288]">{retailer.phone || "ผู้ค้าปลีกที่ลงทะเบียน"}</span></span>
                  {currentCount > 0 && <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[#c45c37] shadow-sm">{currentCount}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section className="min-w-0">
          {selectedRetailer ? (
            <>
              <div className="rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef0fc] text-lg font-black text-[#5965aa]">◫</span><div><p className="text-xs font-black tracking-[.11em] text-[#6370a8]">RETAILER STORE</p><h3 className="text-xl font-black tracking-tight text-[#183f35]">{selectedRetailer.shop_name}</h3></div></div>
                <span className="mt-3 inline-flex rounded-xl bg-[#f4f7f5] px-3 py-2 text-xs font-extrabold text-[#648075] sm:mt-0">{retailerOrders.length} คำสั่งซื้อ</span>
              </div>
              {retailerOrders.length ? (
                <div className="mt-5 grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
                  <div className="rounded-[25px] border border-[#dbe8e2] bg-white p-4 shadow-sm">
                    <p className="px-1 pb-3 text-sm font-black text-[#21483e]">เลือกรายการที่จะจัด</p>
                    <div className="space-y-2">
                      {retailerOrders.map((order) => <OrderSelectRow key={order.id} order={order} selected={order.id === selectedStoreOrder?.id} onClick={() => setSelectedOrderId(order.id)} />)}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <EmployeeOrderManagement
                      order={selectedStoreOrder}
                      busyAction={busyAction}
                      onStatus={changeDeliveryStatus}
                      onShareLocation={startLiveLocationTracking}
                    />
                    <LiveLocationSharingCard
                      order={selectedStoreOrder}
                      active={activeTrackingOrderId === selectedStoreOrder?.id}
                      error={locationError}
                      onStart={startLiveLocationTracking}
                      onStop={() => stopLiveLocationTracking()}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState icon="✓" title="ร้านนี้ยังไม่มีรายการให้จัด" text="เมื่อผู้ค้าปลีกยืนยันตะกร้าสินค้า รายการจะมาปรากฏที่นี่อัตโนมัติ" />
              )}
            </>
          ) : <EmptyState icon="◫" title="ยังไม่มีรายชื่อร้านค้า" text="รอผู้ค้าปลีกลงทะเบียนเข้าสู่ระบบ" />}
        </section>
      </div>
    );
  };

  const renderRetailer = () => {
    const ownOrders = orders.filter((order) => order.retailer_id === (identity?.id || "r-1"));
    const selectedRetailerOrder = ownOrders.find((order) => order.id === selectedOrderId) || ownOrders[0] || null;

    if (activeView === "tracking") {
      return <TrackingWorkspace orders={ownOrders.length ? ownOrders : orders.filter((order) => order.retailer_id === "r-1")} title="ติดตามพนักงาน" caption="ตรวจสอบตำแหน่งล่าสุดของพนักงานที่กำลังนำส่งให้ร้านของคุณ" />;
    }
    if (activeView === "cart") {
      return (
        <div className="space-y-5">
          <RetailerCartPanel cartLines={cartLines} total={cartTotal} onChange={changeCart} onCheckout={checkout} pending={busyAction === "checkout"} standalone />
          <RetailerOrderHistory orders={ownOrders} selectedOrder={selectedRetailerOrder} onSelect={setSelectedOrderId} />
        </div>
      );
    }
    return (
      <div className="grid gap-5 2xl:grid-cols-[1fr_350px]">
        <section className="rounded-[25px] border border-[#dbe8e2] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-[#edf2ef] pb-4 sm:flex-row sm:items-center">
            <div><p className="text-lg font-black tracking-tight text-[#173e34]">สินค้าในระบบ</p><p className="mt-1 text-xs text-[#71877e]">เลือกซื้อได้แบบกล่อง และแพ็คเมื่อมีราคา</p></div>
            <SearchInput query={query} onChange={setQuery} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matchingProducts.map((product) => {
              const amount = cart[product.id] || { boxes: 0, packs: 0 };
              return <RetailerProductCard key={product.id} product={product} boxes={amount.boxes} packs={amount.packs} onChange={changeCart} />;
            })}
          </div>
          {!matchingProducts.length && <EmptyState icon="⌕" title="ไม่พบสินค้า" text="ลองค้นหาด้วยชื่อสินค้าอื่น" />}
        </section>
        <RetailerCartPanel cartLines={cartLines} total={cartTotal} onChange={changeCart} onCheckout={checkout} pending={busyAction === "checkout"} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#11221f]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#dbe7e2] bg-[#fffefb]/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><Brand compact /><span className="hidden h-6 w-px bg-[#d6e4de] sm:block" /><span className="hidden text-xs font-black tracking-[.1em] text-[#678177] sm:block">{meta.label}</span></div>
        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full bg-[#e6f5eb] px-3 py-1.5 text-[11px] font-black text-[#207653] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#35aa74]" />เข้าสู่ระบบแล้ว</span>
          <div className="hidden items-center gap-2 rounded-xl bg-[#f4f7f5] py-1.5 pl-1.5 pr-3 sm:flex"><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-black ${meta.accent}`}>{meta.glyph}</span><span className="max-w-[160px] truncate text-xs font-extrabold text-[#365b50]">{identity?.shop_name || meta.title}</span></div>
          <button disabled={busyAction === "logout"} onClick={handleLogout} className="rounded-xl border border-[#d7e5df] bg-white px-3 py-2 text-xs font-extrabold text-[#49685d] transition hover:border-[#e4aa94] hover:bg-[#fff5f0] hover:text-[#bb5434]">ออกจากระบบ</button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-72px)] border-r border-[#dbe7e2] bg-[#fbfcf8] px-4 py-6 lg:block">
          <div className="mb-7 rounded-[22px] bg-[#0e4d43] p-4 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/12 text-lg">{meta.glyph}</span>
            <p className="mt-4 text-xs font-black tracking-[.13em] text-[#a8ddca]">{meta.label}</p>
            <h2 className="mt-1 text-lg font-black">{meta.title}</h2>
            <p className="mt-2 text-[11px] leading-5 text-[#bfdfd4]">{meta.description}</p>
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => <NavButton key={item.view} item={item} active={activeView === item.view} onClick={() => setActiveView(item.view)} badge={item.view === "cart" ? cartCount : undefined} />)}
          </nav>
          {role === "OWNER" && <div className="mt-8 rounded-2xl border border-[#f0dbd0] bg-[#fff8f4] p-4"><p className="text-[11px] font-black text-[#bb5d3c]">ต้องตรวจสอบ</p><p className="mt-1 text-sm font-black text-[#3b5049]">มี {lowStock.length} สินค้าใกล้หมด</p><button onClick={() => { setActiveView("overview"); setQuery(""); }} className="mt-3 text-xs font-extrabold text-[#bd5d3b]">เปิดคลังสินค้า →</button></div>}
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <nav className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => <NavButton key={item.view} item={item} active={activeView === item.view} onClick={() => setActiveView(item.view)} badge={item.view === "cart" ? cartCount : undefined} compact />)}
          </nav>
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-[11px] font-black tracking-[.13em] text-[#1c8a70]">{meta.label} WORKSPACE</p><h1 className="mt-1 text-3xl font-black tracking-[-.045em] text-[#153b32] sm:text-4xl">{currentView.title}</h1><p className="mt-1.5 text-sm text-[#6c8279]">{currentView.subtitle}</p></div>
            {role === "RETAILER" && activeView !== "cart" && <button onClick={() => setActiveView("cart")} className="inline-flex items-center gap-2 self-start rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(14,77,67,.16)] sm:self-auto"><span>☷</span> ตะกร้าของฉัน {cartCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#f27d52] px-1 text-[10px]">{cartCount}</span>}</button>}
            {role === "OWNER" && activeView === "overview" && <button onClick={() => setActiveView("add-product")} className="inline-flex items-center gap-2 self-start rounded-xl bg-[#f27d52] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(242,125,82,.19)] sm:self-auto"><span className="text-lg leading-none">+</span> เพิ่มสินค้า</button>}
          </div>
          {role === "OWNER" && renderOwner()}
          {role === "ADMIN" && renderAdmin()}
          {role === "EMPLOYEE" && renderEmployee()}
          {role === "RETAILER" && renderRetailer()}
        </main>
      </div>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 rounded-2xl border border-[#b8ded0] bg-[#0e4d43] px-4 py-3 text-center text-sm font-bold text-white shadow-[0_18px_40px_rgba(14,77,67,.28)]">{toast}</div>}
    </div>
  );
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-[#f7f8f4]"><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#0e4d43] text-sm font-black text-white shadow-lg">123</span><p className="mt-4 text-sm font-extrabold text-[#416057]">กำลังเตรียมพื้นที่ทำงาน...</p><span className="mx-auto mt-3 block h-1.5 w-24 overflow-hidden rounded-full bg-[#d9e8e1]"><span className="block h-full w-1/2 rounded-full bg-[#f27d52]" /></span></div></main>;
}

function NavButton({ item, active, onClick, badge, compact = false }: { item: { view: DashboardView; label: string; glyph: string }; active: boolean; onClick: () => void; badge?: number; compact?: boolean }) {
  return <button onClick={onClick} className={`flex shrink-0 items-center gap-3 rounded-xl font-extrabold transition ${compact ? "px-3 py-2.5 text-xs" : "w-full px-3 py-3 text-left text-sm"} ${active ? "bg-[#e2f2eb] text-[#0e5e4f]" : "text-[#61796f] hover:bg-[#f0f6f2] hover:text-[#194e42]"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg text-base leading-none ${active ? "bg-[#0e4d43] text-white" : "bg-[#edf3ef] text-[#54776b]"}`}>{item.glyph}</span><span>{item.label}</span>{typeof badge === "number" && badge > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#f27d52] px-1 text-[10px] text-white">{badge}</span>}</button>;
}

function MetricRow({ metrics }: { metrics: Array<{ label: string; value: string; note: string; glyph: string; tone: string }> }) {
  return <section className="grid gap-3 sm:grid-cols-3">{metrics.map((metric) => <article key={metric.label} className="rounded-[22px] border border-[#dbe8e2] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${metric.tone}`}>{metric.glyph}</span><span className="text-3xl font-black tracking-[-.05em] text-[#173f35]">{metric.value}</span></div><p className="mt-4 text-sm font-black text-[#345b50]">{metric.label}</p><p className="mt-1 text-[11px] font-semibold text-[#778e84]">{metric.note}</p></article>)}</section>;
}

function SearchInput({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  return <label className="flex min-w-[210px] items-center gap-2 rounded-xl border border-[#d6e5de] bg-[#fbfcfa] px-3 py-2.5 text-[#688075] transition focus-within:border-[#1c8068] focus-within:ring-4 focus-within:ring-[#d8eee5]"><span className="text-base">⌕</span><input value={query} onChange={(event) => onChange(event.target.value)} placeholder="ค้นหาสินค้า" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[#32544a] outline-none placeholder:text-[#9cafaa]" /></label>;
}

function ProductMark({ product, size = "md" }: { product: Product; size?: "sm" | "md" }) {
  return <span className={`grid shrink-0 place-items-center rounded-xl font-black ${size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"} ${productTone(product.id)}`}>{product.name.slice(0, 1)}</span>;
}

function InventoryPanel({ title, caption, products, query, onQueryChange, onAdjust, onDelete, busyAction, owner = false }: { title: string; caption: string; products: Product[]; query: string; onQueryChange: (value: string) => void; onAdjust: (product: Product, delta: number) => void; onDelete?: (product: Product) => void; busyAction: string | null; owner?: boolean }) {
  return <section className="overflow-hidden rounded-[25px] border border-[#dbe8e2] bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-[#edf2ef] p-4 sm:flex-row sm:items-center sm:p-5"><div><h2 className="text-lg font-black tracking-tight text-[#173f35]">{title}</h2><p className="mt-1 text-xs text-[#748a80]">{caption}</p></div><SearchInput query={query} onChange={onQueryChange} /></div><div className="divide-y divide-[#edf2ef]">{products.map((product) => { const stock = stockLabel(product.stock); const busy = busyAction === `stock-${product.id}` || busyAction === `delete-${product.id}`; return <div key={product.id} className="flex flex-wrap items-center gap-3 p-4 transition hover:bg-[#fbfdfb] sm:flex-nowrap sm:p-4.5"><ProductMark product={product} /><div className="min-w-[145px] flex-1"><p className="truncate text-sm font-black text-[#2a4c42]">{product.name}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-bold text-[#667e74]">กล่อง {price(product.price_box)}</span>{product.price_pack !== null && <><span className="text-[#bdcbc5]">·</span><span className="text-[11px] font-bold text-[#667e74]">แพ็ค {price(product.price_pack)}</span></>}</div></div><div className="ml-auto flex items-center gap-2"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${stock.className}`}>{stock.text}</span><span className="min-w-8 text-right text-sm font-black text-[#244b40]">{product.stock}</span></div><div className="flex items-center gap-1.5"><button disabled={busy || product.stock === 0} onClick={() => onAdjust(product, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d6e5de] text-lg font-bold text-[#4e7064] transition hover:border-[#df9f85] hover:bg-[#fff5f0] hover:text-[#c85d39] disabled:cursor-not-allowed disabled:opacity-40">−</button><button disabled={busy} onClick={() => onAdjust(product, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-[#e5f3ed] text-lg font-bold text-[#0e715c] transition hover:bg-[#cfeade] disabled:cursor-not-allowed disabled:opacity-40">+</button>{owner && onDelete && <button disabled={busy} onClick={() => onDelete(product)} className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-sm text-[#a17466] transition hover:bg-[#fff0ea] hover:text-[#c35130] disabled:opacity-40" aria-label={`ลบ ${product.name}`}>⌫</button>}</div></div>; })}</div>{!products.length && <EmptyState icon="⌕" title="ไม่พบสินค้า" text="ลองค้นหาด้วยคำอื่น หรือเพิ่มสินค้าใหม่" />}</section>;
}

function QuickActionCard({ title, text, action, glyph, tone, onClick }: { title: string; text: string; action: string; glyph: string; tone: string; onClick: () => void }) {
  return <section className={`rounded-[25px] p-5 text-white shadow-[0_16px_35px_rgba(14,77,67,.18)] ${tone}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 text-xl">{glyph}</span><span className="rounded-full bg-[#65d5a2]/20 px-2.5 py-1 text-[10px] font-black text-[#c6f0df]">● LIVE</span></div><h3 className="mt-6 text-xl font-black tracking-tight">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[#c5e4d9]">{text}</p><button onClick={onClick} className="mt-6 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-[#0e4d43] transition hover:bg-[#e6f4ee]">{action} →</button></section>;
}

function OrderList({ orders, selectedId, onSelect }: { orders: Order[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className="rounded-[25px] border border-[#dbe8e2] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between border-b border-[#edf2ef] pb-4"><div><h2 className="text-lg font-black tracking-tight text-[#173f35]">ใบรวมสินค้า</h2><p className="mt-1 text-xs text-[#748a80]">เลือกเพื่อดูชื่อสินค้า ราคา และยอดรวม</p></div><span className="rounded-xl bg-[#e5f3ed] px-3 py-2 text-xs font-black text-[#0e715c]">{orders.length} ออเดอร์</span></div><div className="mt-4 space-y-2">{orders.map((order) => <OrderSelectRow key={order.id} order={order} selected={order.id === selectedId} onClick={() => onSelect(order.id)} />)}</div>{!orders.length && <EmptyState icon="☷" title="ยังไม่มีรายการสินค้า" text="เมื่อผู้ค้าปลีกยืนยันตะกร้า รายการจะรวมอยู่ที่นี่" />}</section>;
}

function OrderSelectRow({ order, selected, onClick }: { order: Order; selected: boolean; onClick: () => void }) {
  const status = statusMeta[order.status];
  return <button onClick={onClick} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-[#aad6c5] bg-[#eaf6f0]" : "border-transparent bg-[#fafcfb] hover:border-[#d7e7df] hover:bg-white"}`}><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${status.dot}`} /><span className="min-w-0 flex-1 truncate text-sm font-black text-[#2a4e43]">{order.retailer?.shop_name || "ร้านค้าที่ลงทะเบียน"}</span><span className="text-[10px] font-bold text-[#81958e]">{dateTime(order.created_at)}</span></div><div className="mt-2 flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${status.className}`}>{status.label}</span><span className="text-sm font-black text-[#0e594b]">{price(order.total_amount)}</span></div></button>;
}

function OrderDetail({ order }: { order: Order | null }) {
  if (!order) return <EmptyState icon="☷" title="เลือกรายการสินค้า" text="แตะคำสั่งซื้อทางซ้ายเพื่อดูรายละเอียด" />;
  const status = statusMeta[order.status];
  return <section className="rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2ef] pb-5"><div><p className="text-[11px] font-black tracking-[.11em] text-[#6d887e]">ORDER SUMMARY</p><h2 className="mt-1 text-xl font-black tracking-tight text-[#173f35]">{order.retailer?.shop_name || "ร้านค้าที่ลงทะเบียน"}</h2><p className="mt-1 text-xs font-medium text-[#7c9289]">รหัสออเดอร์ {order.id.slice(-8).toUpperCase()} · {dateTime(order.created_at)}</p></div><span className={`rounded-xl px-3 py-2 text-xs font-black ${status.className}`}>{status.label}</span></div><div className="mt-3 divide-y divide-[#edf2ef]">{order.items.map((item) => <div key={item.id || item.product_id} className="flex items-center gap-3 py-3"><ProductMark product={item.product || { id: item.product_id, name: "สินค้าที่ลบแล้ว", price_box: item.unit_price_box, price_pack: item.unit_price_pack, stock: 0 }} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[#305449]">{item.product?.name || "สินค้าที่ลบออกจากคลัง"}</p><p className="mt-0.5 text-[11px] font-semibold text-[#7a9087]">{item.quantity_box > 0 && `${item.quantity_box} กล่อง`}{item.quantity_box > 0 && item.quantity_pack > 0 && " · "}{item.quantity_pack > 0 && `${item.quantity_pack} แพ็ค`}</p></div><span className="text-sm font-black text-[#174d40]">{price(item.line_total)}</span></div>)}</div><div className="mt-4 flex items-end justify-between rounded-2xl bg-[#f2f7f4] p-4"><div><p className="text-xs font-bold text-[#688078]">ยอดรวมทั้งหมด</p><p className="mt-1 text-[11px] text-[#81968d]">{order.items.length} รายการสินค้า</p></div><p className="text-2xl font-black tracking-tight text-[#0e594b]">{price(order.total_amount)}</p></div></section>;
}

function ProductForm({ draft, onChange, onSubmit, pending }: { draft: ProductDraft; onChange: (value: ProductDraft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; pending: boolean }) {
  const update = (key: keyof ProductDraft, value: string) => onChange({ ...draft, [key]: value });
  return <section className="mx-auto max-w-3xl rounded-[27px] border border-[#dbe8e2] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-4 border-b border-[#edf2ef] pb-5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0e9] text-2xl font-black text-[#c45c37]">+</span><div><h2 className="text-xl font-black tracking-tight text-[#173f35]">เพิ่มสินค้าใหม่</h2><p className="mt-1 text-sm leading-6 text-[#72877f]">ราคากล่องเป็นข้อมูลบังคับ ส่วนราคาแพ็คสามารถเว้นว่างได้</p></div></div><form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="ชื่อสินค้า" required className="sm:col-span-2"><input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="เช่น น้ำยาล้างจาน 500 มล." className={inputClass} required /></Field><Field label="ราคากล่อง (บาท)" required><input value={draft.priceBox} onChange={(event) => update("priceBox", event.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className={inputClass} required /></Field><Field label="ราคาแพ็ค (บาท)" hint="ไม่บังคับ"><input value={draft.pricePack} onChange={(event) => update("pricePack", event.target.value)} type="number" min="0" step="0.01" placeholder="เว้นว่างได้" className={inputClass} /></Field><Field label="จำนวนเริ่มต้นในคลัง"><input value={draft.stock} onChange={(event) => update("stock", event.target.value)} type="number" min="0" step="1" placeholder="0" className={inputClass} /></Field><div className="hidden sm:block" /><div className="sm:col-span-2 flex flex-col-reverse gap-3 border-t border-[#edf2ef] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => onChange(createEmptyDraft())} className="rounded-xl px-4 py-3 text-sm font-extrabold text-[#658077] transition hover:bg-[#f3f7f5]">ล้างข้อมูล</button><button disabled={pending} type="submit" className="rounded-xl bg-[#f27d52] px-5 py-3 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(242,125,82,.22)] transition hover:bg-[#e86d43] disabled:opacity-60">{pending ? "กำลังบันทึก..." : "บันทึกสินค้าเข้าคลัง"} →</button></div></form></section>;
}

const inputClass = "w-full rounded-xl border border-[#d4e3dc] bg-[#fbfcfa] px-3.5 py-3 text-sm font-semibold text-[#264c41] outline-none transition placeholder:text-[#a9bbb4] focus:border-[#1f8168] focus:ring-4 focus:ring-[#d8eee5]";

function Field({ label, hint, required, children, className = "" }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 flex items-center gap-1 text-xs font-extrabold text-[#46645a]">{label}{required && <span className="text-[#e26b43]">*</span>}{hint && <span className="ml-1 font-medium text-[#93a49e]">({hint})</span>}</span>{children}</label>;
}

function RetailerProductCard({ product, boxes, packs, onChange }: { product: Product; boxes: number; packs: number; onChange: (product: Product, unit: "boxes" | "packs", delta: number) => void }) {
  const stock = stockLabel(product.stock);
  return <article className="rounded-2xl border border-[#e0ebe5] bg-[#fcfdfc] p-4 transition hover:-translate-y-0.5 hover:border-[#b9dace] hover:shadow-[0_10px_22px_rgba(17,70,58,.07)]"><div className="flex items-start gap-3"><ProductMark product={product} /><div className="min-w-0 flex-1"><p className="min-h-10 text-sm font-black leading-5 text-[#254a40]">{product.name}</p><span className={`mt-2 inline-block rounded-md px-2 py-1 text-[10px] font-black ${stock.className}`}>เหลือ {product.stock}</span></div></div><div className="mt-4 rounded-xl bg-[#f1f6f3] p-3"><PriceStepper label="กล่อง" value={boxes} valueLabel={price(product.price_box)} onDecrease={() => onChange(product, "boxes", -1)} onIncrease={() => onChange(product, "boxes", 1)} /><div className="my-2 border-t border-[#dce8e2]" />{product.price_pack !== null ? <PriceStepper label="แพ็ค" value={packs} valueLabel={price(product.price_pack)} onDecrease={() => onChange(product, "packs", -1)} onIncrease={() => onChange(product, "packs", 1)} /> : <div className="flex items-center justify-between text-[11px] font-semibold text-[#8a9d95]"><span>แพ็ค</span><span>ไม่มีราคาต่อแพ็ค</span></div>}</div></article>;
}

function PriceStepper({ label, value, valueLabel, onDecrease, onIncrease }: { label: string; value: number; valueLabel: string; onDecrease: () => void; onIncrease: () => void }) {
  return <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-black text-[#42665a]">{label}</p><p className="mt-0.5 text-xs font-black text-[#0e6957]">{valueLabel}</p></div><button disabled={value === 0} onClick={onDecrease} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-base font-bold text-[#55776c] shadow-sm transition hover:bg-[#fff0ea] hover:text-[#c45c37] disabled:opacity-35">−</button><span className="grid h-7 min-w-7 place-items-center text-sm font-black text-[#214b40]">{value}</span><button onClick={onIncrease} className="grid h-7 w-7 place-items-center rounded-lg bg-[#0e4d43] text-base font-bold text-white shadow-sm transition hover:bg-[#0a4038]">+</button></div>;
}

function RetailerCartPanel({ cartLines, total, onChange, onCheckout, pending, standalone = false }: { cartLines: CartLine[]; total: number; onChange: (product: Product, unit: "boxes" | "packs", delta: number) => void; onCheckout: () => void; pending: boolean; standalone?: boolean }) {
  return <aside className={`${standalone ? "mx-auto max-w-3xl" : "2xl:sticky 2xl:top-[92px] 2xl:self-start"} rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm`}><div className="flex items-center justify-between border-b border-[#edf2ef] pb-4"><div><h2 className="text-lg font-black tracking-tight text-[#173f35]">ตะกร้าสินค้าของฉัน</h2><p className="mt-1 text-xs text-[#738980]">{cartLines.length ? `${cartLines.length} รายการสินค้า` : "ยังไม่มีสินค้าในตะกร้า"}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0e9] text-lg text-[#c55d3a]">☷</span></div>{standalone && <p className="mt-3 rounded-xl bg-[#f3f7f5] px-3 py-2 text-[11px] font-semibold leading-5 text-[#617b70]">รายการที่เพิ่มจะถูกจำไว้ในเบราว์เซอร์ของร้านนี้ แม้รีเฟรชหน้าเว็บ</p>}{cartLines.length ? <div className="mt-3 divide-y divide-[#edf2ef]">{cartLines.map((line) => <div key={line.product.id} className="py-3"><div className="flex items-center gap-2"><ProductMark product={line.product} size="sm" /><p className="min-w-0 flex-1 truncate text-xs font-black text-[#305449]">{line.product.name}</p><span className="text-xs font-black text-[#0e5e4f]">{price(line.boxes * line.product.price_box + line.packs * (line.product.price_pack || 0))}</span></div><div className="mt-2 ml-11 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1 rounded-lg bg-[#f3f7f5] px-1 py-1 text-[10px] font-bold text-[#617b70]"><button onClick={() => onChange(line.product, "boxes", -1)} className="grid h-5 w-5 place-items-center rounded bg-white text-sm text-[#486b5e] shadow-sm">−</button>{line.boxes} กล่อง<button onClick={() => onChange(line.product, "boxes", 1)} className="grid h-5 w-5 place-items-center rounded bg-[#0e4d43] text-sm text-white shadow-sm">+</button></span>{line.product.price_pack !== null && <span className="inline-flex items-center gap-1 rounded-lg bg-[#f3f7f5] px-1 py-1 text-[10px] font-bold text-[#617b70]"><button onClick={() => onChange(line.product, "packs", -1)} className="grid h-5 w-5 place-items-center rounded bg-white text-sm text-[#486b5e] shadow-sm">−</button>{line.packs} แพ็ค<button onClick={() => onChange(line.product, "packs", 1)} className="grid h-5 w-5 place-items-center rounded bg-[#0e4d43] text-sm text-white shadow-sm">+</button></span>}</div></div>)}</div> : <div className="py-12 text-center"><span className="grid mx-auto h-12 w-12 place-items-center rounded-2xl bg-[#f1f6f3] text-xl text-[#88a096]">☷</span><p className="mt-3 text-sm font-black text-[#557268]">ตะกร้ายังว่าง</p><p className="mt-1 text-xs leading-5 text-[#83978f]">เลือกสินค้าและระบุจำนวนที่ต้องการ</p></div>}<div className="mt-4 rounded-2xl bg-[#e5f3ed] p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-bold text-[#5d786d]">ยอดรวมทั้งหมด</p><p className="mt-1 text-[11px] text-[#769087]">รวมราคากล่องและแพ็ค</p></div><p className="text-2xl font-black tracking-tight text-[#0e5e4f]">{price(total)}</p></div></div><button disabled={!cartLines.length || pending} onClick={onCheckout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f27d52] py-3.5 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(242,125,82,.2)] transition hover:bg-[#e86d43] disabled:cursor-not-allowed disabled:opacity-45">{pending ? "กำลังยืนยัน..." : "ยืนยันการสั่งซื้อสินค้า"} <span>→</span></button></aside>;
}

function RetailerOrderHistory({ orders, selectedOrder, onSelect }: { orders: Order[]; selectedOrder: Order | null; onSelect: (id: string) => void }) {
  return (
    <section className="mx-auto max-w-5xl rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2ef] pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-[#173f35]">คำสั่งซื้อที่บันทึกแล้ว</h2>
          <p className="mt-1 text-xs text-[#738980]">ดูรายการสินค้า ราคา ยอดรวม และสถานะการจัดส่งได้ทุกครั้ง</p>
        </div>
        <span className="rounded-xl bg-[#e5f3ed] px-3 py-2 text-xs font-black text-[#0e715c]">{orders.length} ออเดอร์</span>
      </div>

      {orders.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
          <div className="space-y-2 rounded-2xl bg-[#f7faf8] p-3">
            {orders.map((order) => {
              const status = statusMeta[order.status];
              const selected = order.id === selectedOrder?.id;
              return (
                <button key={order.id} onClick={() => onSelect(order.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-[#aad6c5] bg-[#eaf6f0]" : "border-transparent bg-white hover:border-[#d7e7df]"}`}>
                  <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${status.dot}`} /><span className="min-w-0 flex-1 truncate text-xs font-black text-[#2a4e43]">ออเดอร์ {order.id.slice(-8).toUpperCase()}</span></div>
                  <p className="mt-1 text-[11px] font-semibold text-[#81958e]">{dateTime(order.created_at)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${status.className}`}>{status.label}</span><span className="text-sm font-black text-[#0e594b]">{price(order.total_amount)}</span></div>
                </button>
              );
            })}
          </div>
          <OrderDetail order={selectedOrder} />
        </div>
      ) : (
        <EmptyState icon="☷" title="ยังไม่มีคำสั่งซื้อที่ยืนยันแล้ว" text="เลือกสินค้าใส่ตะกร้า แล้วกดยืนยันการสั่งซื้อเพื่อเก็บรายการไว้ที่นี่" />
      )}
    </section>
  );
}

function EmployeeOrderManagement({ order, busyAction, onStatus, onShareLocation }: { order: Order | null; busyAction: string | null; onStatus: (order: Order, status: OrderStatus) => void; onShareLocation: (order: Order) => void }) {
  if (!order) return <EmptyState icon="☷" title="ไม่มีรายการให้จัด" text="เลือกร้านค้าอื่นหรือรอคำสั่งซื้อใหม่" />;
  const status = statusMeta[order.status];
  const busy = busyAction === `order-${order.id}` || busyAction === `location-${order.id}`;
  return <section className="rounded-[25px] border border-[#dbe8e2] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2ef] pb-4"><div><p className="text-[11px] font-black tracking-[.11em] text-[#6270a8]">ORDER TO PROCESS</p><h3 className="mt-1 text-xl font-black text-[#193f35]">{order.retailer?.shop_name || "ร้านค้าที่ลงทะเบียน"}</h3><p className="mt-1 text-xs text-[#779087]">ออเดอร์ {order.id.slice(-8).toUpperCase()} · {dateTime(order.created_at)}</p></div><span className={`rounded-xl px-3 py-2 text-xs font-black ${status.className}`}>{status.label}</span></div><div className="mt-4 divide-y divide-[#edf2ef]">{order.items.map((item) => <div key={item.id || item.product_id} className="flex items-center gap-3 py-3"><ProductMark product={item.product || { id: item.product_id, name: "สินค้าที่ลบแล้ว", price_box: item.unit_price_box, price_pack: item.unit_price_pack, stock: 0 }} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[#2b5045]">{item.product?.name || "สินค้าที่ลบออกจากคลัง"}</p><p className="mt-0.5 text-xs text-[#7c9389]">{item.quantity_box ? `${item.quantity_box} กล่อง` : ""}{item.quantity_box && item.quantity_pack ? " · " : ""}{item.quantity_pack ? `${item.quantity_pack} แพ็ค` : ""}</p></div><span className="text-sm font-black text-[#0e5e4f]">{price(item.line_total)}</span></div>)}</div><div className="mt-5 rounded-2xl bg-[#f3f7f5] p-4"><p className="text-xs font-black text-[#345f52]">ขั้นตอนการทำงาน</p><div className="mt-3 flex flex-wrap gap-2">{["PENDING", "PACKED", "DELIVERING", "COMPLETED"].map((step, index) => { const isCurrent = order.status === step; const isDone = ["PENDING", "PACKED", "DELIVERING", "COMPLETED"].indexOf(order.status) > index; return <span key={step} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${isCurrent ? "bg-[#0e4d43] text-white" : isDone ? "bg-[#dff1e8] text-[#207653]" : "bg-white text-[#8a9b95]"}`}>{statusMeta[step as OrderStatus].label}</span>; })}</div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row">{order.status === "PENDING" && <button disabled={busy} onClick={() => onStatus(order, "PACKED")} className="flex-1 rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0a4038] disabled:opacity-60">จัดการสินค้าเสร็จสิ้น</button>}{order.status === "PACKED" && <button disabled={busy} onClick={() => onStatus(order, "DELIVERING")} className="flex-1 rounded-xl bg-[#5965aa] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#4c5798] disabled:opacity-60">เริ่มนำส่งสินค้า</button>}{order.status === "DELIVERING" && <><button disabled={busy} onClick={() => onShareLocation(order)} className="flex-1 rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0a4038] disabled:opacity-60">{busyAction === `location-${order.id}` ? "กำลังส่งพิกัด..." : "ส่งพิกัดปัจจุบัน"}</button><button disabled={busy} onClick={() => onStatus(order, "COMPLETED")} className="rounded-xl bg-[#e6f4ed] px-4 py-3 text-sm font-extrabold text-[#167157] transition hover:bg-[#d2ebdf] disabled:opacity-60">ส่งสำเร็จ</button></>}{order.status === "COMPLETED" && <p className="w-full rounded-xl bg-[#e7f5ed] px-4 py-3 text-center text-sm font-extrabold text-[#227654]">✓ งานนี้จัดส่งเรียบร้อยแล้ว</p>}</div></section>;
}

function LiveLocationSharingCard({ order, active, error, onStart, onStop }: {
  order: Order | null;
  active: boolean;
  error: string | null;
  onStart: (order: Order) => void;
  onStop: () => void;
}) {
  if (!order || order.status !== "DELIVERING") return null;

  return (
    <section className={`rounded-[22px] border p-4 ${active ? "border-[#b9dfce] bg-[#ecf8f1]" : "border-[#dbe8e2] bg-white"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${active ? "bg-[#0e4d43] text-white" : "bg-[#eef0fc] text-[#5965aa]"}`}>⌁</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[#193f35]">แชร์ตำแหน่งพนักงาน</p>
          <p className="mt-1 text-xs leading-5 text-[#6b8379]">
            {active
              ? "กำลังส่งตำแหน่งจริงจาก GPS ให้เจ้าของร้านและผู้ค้าปลีก"
              : "กดเริ่ม แล้วอนุญาต Location ในเบราว์เซอร์เพื่อเริ่มติดตาม"}
          </p>
        </div>
        <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${active ? "bg-[#39ae77] shadow-[0_0_0_4px_rgba(57,174,119,.15)]" : "bg-[#b4c5bd]"}`} />
      </div>
      {active && <p className="mt-3 rounded-xl bg-white/75 px-3 py-2 text-[11px] font-semibold leading-5 text-[#277057]">อัปเดตเมื่อขยับอย่างน้อย 25 ม. หรือทุก 15 วินาที โปรดเปิดหน้านี้ไว้ระหว่างนำส่ง</p>}
      {error && <p className="mt-3 rounded-xl bg-[#fff1ec] px-3 py-2 text-[11px] font-semibold leading-5 text-[#b95634]">{error}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {active ? (
          <button onClick={onStop} className="flex-1 rounded-xl bg-[#173f35] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0e4d43]">หยุดแชร์ตำแหน่ง</button>
        ) : (
          <button onClick={() => onStart(order)} className="flex-1 rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0a4038]">เริ่มแชร์ตำแหน่งจริง</button>
        )}
      </div>
    </section>
  );
}

function TrackingWorkspace({ orders, title, caption }: { orders: Order[]; title: string; caption: string }) {
  const delivering = orders.filter((order) => order.status === "DELIVERING");
  const target = delivering.find((order) => order.tracking) || delivering[0] || orders.find((order) => order.tracking) || null;
  const liveTracking = target?.tracking;
  if (liveTracking) return <LiveTrackingWorkspace orders={orders} title={title} caption={caption} target={target} tracking={liveTracking} />;
  const tracking = target?.tracking || null;
  return <section className="overflow-hidden rounded-[27px] border border-[#dbe8e2] bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-[#e2ebe6] p-5 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black tracking-tight text-[#173f35]">{title}</h2><p className="mt-1 text-sm text-[#71877e]">{caption}</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e5f5eb] px-3 py-1.5 text-[11px] font-black text-[#1b7654]"><span className="h-2 w-2 rounded-full bg-[#39ae77] shadow-[0_0_0_4px_rgba(57,174,119,.15)]" /> LIVE TRACKING</span></div><div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:p-5"><div className="map-surface relative min-h-[390px] overflow-hidden rounded-[22px] border border-[#caddd4]"><div className="absolute left-[13%] top-[16%] rounded-lg bg-white/85 px-2 py-1 text-[10px] font-black text-[#49756a] shadow-sm">ถ.พระราม 4</div><div className="absolute right-[13%] top-[18%] rounded-lg bg-white/85 px-2 py-1 text-[10px] font-black text-[#49756a] shadow-sm">บางรัก</div><div className="absolute bottom-[19%] left-[26%] rounded-lg bg-white/85 px-2 py-1 text-[10px] font-black text-[#49756a] shadow-sm">คลองสาน</div><svg className="absolute inset-0 h-full w-full" viewBox="0 0 700 420" preserveAspectRatio="none" fill="none" aria-hidden="true"><path className="map-route" d="M112 336C190 310 202 147 310 191C415 234 399 328 579 101" stroke="#f27d52" strokeWidth="4" strokeLinecap="round" /><path d="M112 336C190 310 202 147 310 191C415 234 399 328 579 101" stroke="white" strokeOpacity=".8" strokeWidth="11" strokeLinecap="round" /></svg><MapPin className="left-[13%] top-[74%]" type="shop" label="คลังสินค้า" /><MapPin className="left-[43%] top-[42%]" type="truck" label={tracking?.employee?.shop_name || "พนักงานนำส่ง"} /><MapPin className="right-[14%] top-[18%]" type="shop" label={target?.retailer?.shop_name || "ปลายทาง"} /><div className="absolute bottom-4 left-4 rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur"><p className="text-[10px] font-black text-[#25554a]">ตำแหน่งอัปเดตล่าสุด</p><p className="mt-0.5 text-[11px] font-semibold text-[#778f85]">{tracking ? `${tracking.latitude.toFixed(4)}, ${tracking.longitude.toFixed(4)}` : "รอพนักงานแชร์พิกัด"}</p></div></div><aside className="rounded-[22px] bg-[#f1f6f3] p-5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0e4d43] text-xl text-white">⌁</span><p className="mt-5 text-[11px] font-black tracking-[.11em] text-[#638075]">DELIVERY STATUS</p><h3 className="mt-1 text-xl font-black tracking-tight text-[#173f35]">{target?.retailer?.shop_name || "ยังไม่มีการนำส่ง"}</h3><p className="mt-2 text-sm leading-6 text-[#668077]">{target ? `ยอดคำสั่งซื้อ ${price(target.total_amount)} · ${statusMeta[target.status].label}` : "เมื่อพนักงานเริ่มนำส่ง สถานะและพิกัดจะแสดงที่นี่"}</p><div className="mt-5 space-y-3">{orders.filter((order) => order.status === "DELIVERING").map((order) => <div key={order.id} className="rounded-xl bg-white p-3 shadow-sm"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#747bd1]" /><span className="min-w-0 flex-1 truncate text-xs font-black text-[#365b50]">{order.retailer?.shop_name || "ร้านค้า"}</span></div><p className="mt-1 text-[11px] text-[#7b9288]">{order.tracking ? `อัปเดต ${dateTime(order.tracking.updated_at)}` : "กำลังรอพิกัด"}</p></div>)}</div></aside></div></section>;
}

function LiveTrackingWorkspace({ orders, title, caption, target, tracking }: {
  orders: Order[];
  title: string;
  caption: string;
  target: Order | null;
  tracking: DeliveryTracking;
}) {
  const deliveringOrders = orders.filter((order) => order.status === "DELIVERING");
  const mapUrl = googleMapsUrl(tracking.latitude, tracking.longitude);

  return (
    <section className="overflow-hidden rounded-[27px] border border-[#dbe8e2] bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-[#e2ebe6] p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#173f35]">{title}</h2>
          <p className="mt-1 text-sm text-[#71877e]">{caption}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e5f5eb] px-3 py-1.5 text-[11px] font-black text-[#1b7654]">
          <span className="h-2 w-2 rounded-full bg-[#39ae77] shadow-[0_0_0_4px_rgba(57,174,119,.15)]" /> LIVE GPS
        </span>
      </div>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_310px] lg:p-5">
        <div className="relative min-h-[390px] overflow-hidden rounded-[22px] border border-[#caddd4] bg-[#edf5f0]">
          <iframe
            title={`ตำแหน่งพนักงานสำหรับ ${target?.retailer?.shop_name || "คำสั่งซื้อ"}`}
            src={mapEmbedUrl(tracking.latitude, tracking.longitude)}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="absolute bottom-4 left-4 rounded-xl border border-white/70 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-[10px] font-black text-[#25554a]">ตำแหน่ง GPS ล่าสุด</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#52736a]">{tracking.latitude.toFixed(6)}, {tracking.longitude.toFixed(6)}</p>
            <p className="mt-0.5 text-[10px] text-[#778f85]">อัปเดต {dateTime(tracking.updated_at)}</p>
          </div>
        </div>
        <aside className="rounded-[22px] bg-[#f1f6f3] p-5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0e4d43] text-xl text-white">⌁</span>
          <p className="mt-5 text-[11px] font-black tracking-[.11em] text-[#638075]">DELIVERY STATUS</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-[#173f35]">{target?.retailer?.shop_name || "กำลังนำส่ง"}</h3>
          <p className="mt-2 text-sm leading-6 text-[#668077]">{target ? `ยอดคำสั่งซื้อ ${price(target.total_amount)} · ${statusMeta[target.status].label}` : "ตำแหน่งที่พนักงานแชร์ล่าสุด"}</p>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0a4038]">เปิดใน Google Maps ↗</a>
          <div className="mt-5 space-y-3">
            {deliveringOrders.map((order) => (
              <div key={order.id} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#747bd1]" /><span className="min-w-0 flex-1 truncate text-xs font-black text-[#365b50]">{order.retailer?.shop_name || "ร้านค้า"}</span></div>
                <p className="mt-1 text-[11px] text-[#7b9288]">{order.tracking ? `อัปเดต ${dateTime(order.tracking.updated_at)}` : "กำลังรอพิกัด"}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function MapPin({ className, type, label }: { className: string; type: "shop" | "truck"; label: string }) {
  const isTruck = type === "truck";
  return <div className={`absolute ${className}`}><span className={`pin-pulse absolute -left-2 -top-2 h-12 w-12 rounded-full ${isTruck ? "bg-[#0e4d43]/20" : "bg-[#f27d52]/20"}`} /><span className={`relative grid h-8 w-8 place-items-center rounded-full border-[3px] border-white text-sm shadow-[0_6px_16px_rgba(12,69,58,.22)] ${isTruck ? "bg-[#0e4d43] text-white" : "bg-[#f27d52] text-white"}`}>{isTruck ? "⌁" : "◫"}</span><span className="absolute left-1/2 top-10 w-max -translate-x-1/2 rounded-md bg-[#133e34] px-2 py-1 text-[9px] font-black text-white shadow-sm">{label}</span></div>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="m-0 grid min-h-52 place-items-center p-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f0f5f2] text-xl font-black text-[#769187]">{icon}</span><h3 className="mt-4 text-base font-black text-[#34594e]">{title}</h3><p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-[#83968f]">{text}</p></div></div>;
}
