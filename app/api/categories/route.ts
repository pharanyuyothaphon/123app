import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { adminRequest, serverRpc } from "@/lib/server-db";
import type { ProductCategory } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CategoryMutationResult = {
  category?: ProductCategory;
  deleted?: boolean;
  id?: string;
};

function isOwner(role: string) {
  return role === "OWNER";
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function invalidName(name: string) {
  return !name || name.length > 80;
}

export async function GET() {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });

  try {
    const categories = await adminRequest<ProductCategory[]>(
      "/rest/v1/product_categories?select=id,name,normalized_name,is_active,created_at,updated_at&order=is_active.desc,name.asc",
    );
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถโหลดประเภทสินค้าได้" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!isOwner(auth.profile.role)) return NextResponse.json({ message: "เฉพาะ OWNER เท่านั้นที่จัดการประเภทสินค้าได้" }, { status: 403 });

  let input: { name?: unknown };
  try {
    input = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const name = cleanName(input.name);
  if (invalidName(name)) return NextResponse.json({ message: "ชื่อประเภทสินค้าต้องมี 1–80 ตัวอักษร" }, { status: 400 });

  try {
    const result = await serverRpc<CategoryMutationResult>("custom_manage_product_category", {
      p_owner_id: auth.user.id,
      p_action: "create",
      p_category_id: null,
      p_name: name,
      p_is_active: null,
    });
    if (!result.category) throw new Error("ไม่สามารถเพิ่มประเภทสินค้าได้");
    return NextResponse.json({ category: result.category }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "เพิ่มประเภทสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!isOwner(auth.profile.role)) return NextResponse.json({ message: "เฉพาะ OWNER เท่านั้นที่จัดการประเภทสินค้าได้" }, { status: 403 });

  let input: { id?: unknown; name?: unknown; isActive?: unknown };
  try {
    input = (await request.json()) as { id?: unknown; name?: unknown; isActive?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const id = typeof input.id === "string" ? input.id : "";
  const hasName = input.name !== undefined;
  const name = hasName ? cleanName(input.name) : null;
  const hasIsActive = input.isActive !== undefined;
  const isActive = hasIsActive && typeof input.isActive === "boolean" ? input.isActive : null;
  if (!uuidPattern.test(id) || (!hasName && !hasIsActive) || (hasName && invalidName(name || "")) || (hasIsActive && isActive === null)) {
    return NextResponse.json({ message: "ข้อมูลประเภทสินค้าไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const result = await serverRpc<CategoryMutationResult>("custom_manage_product_category", {
      p_owner_id: auth.user.id,
      p_action: "update",
      p_category_id: id,
      p_name: name,
      p_is_active: isActive,
    });
    if (!result.category) throw new Error("ไม่สามารถบันทึกประเภทสินค้าได้");
    return NextResponse.json({ category: result.category });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "บันทึกประเภทสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!isOwner(auth.profile.role)) return NextResponse.json({ message: "เฉพาะ OWNER เท่านั้นที่จัดการประเภทสินค้าได้" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(id)) return NextResponse.json({ message: "รหัสประเภทสินค้าไม่ถูกต้อง" }, { status: 400 });

  try {
    const result = await serverRpc<CategoryMutationResult>("custom_manage_product_category", {
      p_owner_id: auth.user.id,
      p_action: "delete",
      p_category_id: id,
      p_name: null,
      p_is_active: null,
    });
    if (!result.deleted) throw new Error("ไม่สามารถลบประเภทสินค้าได้");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ลบประเภทสินค้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
