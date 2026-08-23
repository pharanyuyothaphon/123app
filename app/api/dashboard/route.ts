import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { adminRequest } from "@/lib/server-db";
import type { DashboardSnapshot, DeliveryTracking, Order, Product, Retailer } from "@/lib/types";

type RawOrder = Omit<Order, "retailer" | "items" | "tracking"> & {
  retailer?: Retailer | Retailer[] | null;
  items?: Order["items"];
};

type RawTracking = Omit<DeliveryTracking, "employee"> & {
  employee?: NonNullable<DeliveryTracking["employee"]> | NonNullable<DeliveryTracking["employee"]>[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function normalizeOrders(orders: RawOrder[], tracking: DeliveryTracking[]): Order[] {
  return orders.map((order) => ({
    ...order,
    retailer: one(order.retailer),
    items: order.items || [],
    tracking: tracking.find((item) => item.order_id === order.id) || null,
  }));
}

export async function GET() {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  try {
    const productQuery = "/rest/v1/products?select=id,name,price_box,price_pack,stock,created_at&order=stock.asc";
    const orderQuery =
      "/rest/v1/orders?select=id,retailer_id,assigned_employee_id,status,total_amount,created_at," +
      "retailer:profiles!orders_retailer_id_fkey(id,shop_name,phone,role)," +
      "items:order_items(id,product_id,quantity_box,quantity_pack,unit_price_box,unit_price_pack,line_total," +
      "product:products(id,name,price_box,price_pack,stock))&order=created_at.desc";
    const trackingQuery =
      "/rest/v1/delivery_tracking?select=order_id,employee_id,latitude,longitude,updated_at," +
      "employee:profiles!delivery_tracking_employee_id_fkey(id,shop_name)";
    const retailerQuery = "/rest/v1/profiles?select=id,shop_name,phone,role&role=eq.RETAILER&order=created_at.desc";

    const canViewOrders = auth.profile.role === "OWNER" || auth.profile.role === "EMPLOYEE" || auth.profile.role === "RETAILER";
    const filteredOrderQuery = auth.profile.role === "RETAILER"
      ? `${orderQuery}&retailer_id=eq.${encodeURIComponent(auth.user.id)}`
      : orderQuery;

    const [products, rawOrders, rawTracking, retailers] = await Promise.all([
      adminRequest<Product[]>(productQuery),
      canViewOrders ? adminRequest<RawOrder[]>(filteredOrderQuery) : Promise.resolve([] as RawOrder[]),
      canViewOrders ? adminRequest<RawTracking[]>(trackingQuery) : Promise.resolve([] as RawTracking[]),
      auth.profile.role === "EMPLOYEE" ? adminRequest<Retailer[]>(retailerQuery) : Promise.resolve([] as Retailer[]),
    ]);

    const orderIds = new Set(rawOrders.map((order) => order.id));
    const tracking = rawTracking
      .filter((item) => orderIds.has(item.order_id))
      .map((item) => ({ ...item, employee: one(item.employee) }));
    const snapshot: DashboardSnapshot = {
      products: [...products].sort((left, right) => left.stock - right.stock),
      orders: normalizeOrders(rawOrders, tracking),
      retailers,
      tracking,
    };
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ message: "ไม่สามารถโหลดข้อมูล Dashboard ได้" }, { status: 500 });
  }
}
