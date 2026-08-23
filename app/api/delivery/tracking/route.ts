import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { serverRpc } from "@/lib/server-db";
import type { DeliveryTracking } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (auth.profile.role !== "EMPLOYEE") {
    return NextResponse.json({ message: "เฉพาะพนักงานเท่านั้นที่ส่งพิกัดได้" }, { status: 403 });
  }

  let input: { orderId?: unknown; latitude?: unknown; longitude?: unknown };
  try {
    input = (await request.json()) as { orderId?: unknown; latitude?: unknown; longitude?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (
    typeof input.orderId !== "string" || !uuidPattern.test(input.orderId) ||
    typeof input.latitude !== "number" || !Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
    typeof input.longitude !== "number" || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180
  ) {
    return NextResponse.json({ message: "ข้อมูลพิกัดไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const tracking = await serverRpc<DeliveryTracking>("custom_save_delivery_tracking", {
      p_employee_id: auth.user.id,
      p_order_id: input.orderId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
    });
    return NextResponse.json({ tracking });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ส่งพิกัดไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
