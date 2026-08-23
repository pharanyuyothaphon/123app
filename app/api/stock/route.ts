import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { serverRpc } from "@/lib/server-db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (auth.profile.role !== "OWNER" && auth.profile.role !== "ADMIN") {
    return NextResponse.json({ message: "ไม่มีสิทธิ์ปรับจำนวนสินค้า" }, { status: 403 });
  }

  let input: { productId?: unknown; delta?: unknown };
  try {
    input = (await request.json()) as { productId?: unknown; delta?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (
    typeof input.productId !== "string" || !uuidPattern.test(input.productId) ||
    typeof input.delta !== "number" || !Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 10_000
  ) {
    return NextResponse.json({ message: "ข้อมูลปรับสต็อกไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const rows = await serverRpc<Array<{ stock: number }>>("custom_adjust_stock", {
      p_actor_id: auth.user.id,
      p_product_id: input.productId,
      p_delta: input.delta,
    });
    if (!rows[0]) throw new Error("ไม่สามารถปรับจำนวนสินค้าได้");
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "อัปเดตจำนวนสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
