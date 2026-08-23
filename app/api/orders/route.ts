import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { serverRpc } from "@/lib/server-db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrderInputItem = {
  product_id?: unknown;
  quantity_box?: unknown;
  quantity_pack?: unknown;
};

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (auth.profile.role !== "RETAILER") {
    return NextResponse.json({ message: "เฉพาะผู้ค้าปลีกเท่านั้นที่สั่งซื้อได้" }, { status: 403 });
  }

  let input: { items?: unknown };
  try {
    input = (await request.json()) as { items?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    return NextResponse.json({ message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const items = (input.items as OrderInputItem[]).map((item) => ({
    product_id: typeof item.product_id === "string" ? item.product_id : "",
    quantity_box: item.quantity_box,
    quantity_pack: item.quantity_pack,
  }));
  const valid = items.every((item) =>
    uuidPattern.test(item.product_id) &&
    typeof item.quantity_box === "number" && Number.isInteger(item.quantity_box) && item.quantity_box >= 0 && item.quantity_box <= 10_000 &&
    typeof item.quantity_pack === "number" && Number.isInteger(item.quantity_pack) && item.quantity_pack >= 0 && item.quantity_pack <= 10_000,
  );
  if (!valid || !items.some((item) => Number(item.quantity_box) > 0 || Number(item.quantity_pack) > 0)) {
    return NextResponse.json({ message: "จำนวนสินค้าที่เลือกไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const orderId = await serverRpc<string>("custom_create_retailer_order", {
      p_retailer_id: auth.user.id,
      p_items: items,
    });
    return NextResponse.json({ orderId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถสร้างคำสั่งซื้อได้" },
      { status: 400 },
    );
  }
}
