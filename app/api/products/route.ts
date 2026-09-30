import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { adminRequest } from "@/lib/server-db";
import type { Product, ProductCategory } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isOwner(role: string) {
  return role === "OWNER";
}

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!isOwner(auth.profile.role)) return NextResponse.json({ message: "เฉพาะ OWNER เท่านั้นที่เพิ่มสินค้าได้" }, { status: 403 });

  let input: { name?: unknown; categoryId?: unknown; category?: unknown; price_box?: unknown; price_pack?: unknown; stock?: unknown };
  try {
    input = (await request.json()) as { name?: unknown; categoryId?: unknown; category?: unknown; price_box?: unknown; price_pack?: unknown; stock?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  const legacyCategory = typeof input.category === "string" ? input.category.trim() : "";
  const priceBox = input.price_box;
  const pricePack = input.price_pack;
  const stock = input.stock;
  if (
    !name || name.length > 160 ||
    (categoryId && !uuidPattern.test(categoryId)) || (!categoryId && (!legacyCategory || legacyCategory.length > 80)) ||
    typeof priceBox !== "number" || !Number.isFinite(priceBox) || priceBox < 0 ||
    (pricePack !== null && (typeof pricePack !== "number" || !Number.isFinite(pricePack) || pricePack < 0)) ||
    typeof stock !== "number" || !Number.isInteger(stock) || stock < 0
  ) {
    return NextResponse.json({ message: "ข้อมูลสินค้าไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const categoryQuery = categoryId
      ? `/rest/v1/product_categories?select=id,name,is_active&id=eq.${encodeURIComponent(categoryId)}`
      : `/rest/v1/product_categories?select=id,name,is_active&normalized_name=eq.${encodeURIComponent(normalizeCategoryName(legacyCategory))}`;
    const categories = await adminRequest<Array<Pick<ProductCategory, "id" | "name" | "is_active">>>(categoryQuery);
    const category = categories[0];
    if (!category || !category.is_active) {
      return NextResponse.json({ message: "กรุณาเลือกประเภทสินค้าที่เปิดใช้งานอยู่" }, { status: 400 });
    }

    const rows = await adminRequest<Product[]>("/rest/v1/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name, category: category.name, category_id: category.id, price_box: priceBox, price_pack: pricePack, stock, created_by: auth.user.id }),
    });
    if (!rows[0]) throw new Error("ไม่สามารถเพิ่มสินค้าได้");
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "เพิ่มสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!isOwner(auth.profile.role)) return NextResponse.json({ message: "เฉพาะ OWNER เท่านั้นที่ลบสินค้าได้" }, { status: 403 });

  const productId = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(productId)) return NextResponse.json({ message: "รหัสสินค้าไม่ถูกต้อง" }, { status: 400 });

  try {
    const rows = await adminRequest<Product[]>(`/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!rows[0]) return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ลบสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
