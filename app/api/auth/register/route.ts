import { NextResponse } from "next/server";
import { isCustomSessionConfigured } from "@/lib/custom-session";
import { hashPassword } from "@/lib/password";
import { isThaiMobilePhone, normalizePhone } from "@/lib/phone";
import { isServerDatabaseConfigured, serverRpc } from "@/lib/server-db";

function ready() {
  return isCustomSessionConfigured() && isServerDatabaseConfigured();
}

function configurationMessage() {
  const missing = [
    !isServerDatabaseConfigured() && "NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY",
    !isCustomSessionConfigured() && "CUSTOM_AUTH_SESSION_SECRET",
  ].filter(Boolean);
  return `ยังไม่ได้ตั้งค่า Custom Auth: โปรดกำหนด ${missing.join(" และ ")}`;
}

export async function POST(request: Request) {
  if (!ready()) {
    return NextResponse.json(
      { message: configurationMessage() },
      { status: 503 },
    );
  }

  let input: { phone?: unknown; shopName?: unknown; password?: unknown };
  try {
    input = (await request.json()) as { phone?: unknown; shopName?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (typeof input.phone !== "string" || typeof input.shopName !== "string" || typeof input.password !== "string") {
    return NextResponse.json({ message: "กรุณาระบุเบอร์โทรศัพท์ ชื่อร้าน และรหัสผ่าน" }, { status: 400 });
  }

  const shopName = input.shopName.trim();
  if (!isThaiMobilePhone(input.phone)) {
    return NextResponse.json({ message: "กรุณากรอกเบอร์มือถือไทยให้ถูกต้อง" }, { status: 400 });
  }
  if (shopName.length < 2 || shopName.length > 120) {
    return NextResponse.json({ message: "ชื่อร้านต้องมีความยาว 2–120 ตัวอักษร" }, { status: 400 });
  }
  if (input.password.length < 8 || input.password.length > 128) {
    return NextResponse.json({ message: "รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร" }, { status: 400 });
  }

  try {
    const credential = await hashPassword(input.password);
    const profileId = await serverRpc<string>("custom_register_retailer", {
      p_phone: normalizePhone(input.phone),
      p_shop_name: shopName,
      p_password_salt: credential.salt,
      p_password_hash: credential.hash,
    });
    return NextResponse.json({ ok: true, profileId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ลงทะเบียนไม่สำเร็จ";
    const migrationMissing = /custom_register_retailer|app_credentials|relation/i.test(message);
    return NextResponse.json(
      { message: migrationMissing ? "ยังไม่ได้รัน supabase/custom-auth-migration.sql" : message },
      { status: 400 },
    );
  }
}
