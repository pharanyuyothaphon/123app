import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { serverRpc } from "@/lib/server-db";
import type { Order, OrderStatus } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deliveryStatuses: OrderStatus[] = ["PACKED", "DELIVERING", "COMPLETED"];

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (auth.profile.role !== "EMPLOYEE") {
    return NextResponse.json({ message: "เฉพาะพนักงานเท่านั้นที่อัปเดตสถานะจัดส่งได้" }, { status: 403 });
  }

  let input: { orderId?: unknown; status?: unknown };
  try {
    input = (await request.json()) as { orderId?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (
    typeof input.orderId !== "string" || !uuidPattern.test(input.orderId) ||
    typeof input.status !== "string" || !deliveryStatuses.includes(input.status as OrderStatus)
  ) {
    return NextResponse.json({ message: "ข้อมูลสถานะจัดส่งไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const order = await serverRpc<Order>("custom_update_delivery_status", {
      p_employee_id: auth.user.id,
      p_order_id: input.orderId,
      p_status: input.status,
    });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "อัปเดตสถานะจัดส่งไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
