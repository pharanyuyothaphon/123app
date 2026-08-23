import { NextResponse } from "next/server";
import {
  createCustomSession,
  CUSTOM_SESSION_COOKIE,
  CUSTOM_SESSION_TTL_SECONDS,
  isCustomSessionConfigured,
} from "@/lib/custom-session";
import { verifyPassword } from "@/lib/password";
import { isThaiMobilePhone, normalizePhone } from "@/lib/phone";
import { isRole, roleDashboardPath } from "@/lib/role-routes";
import { adminRequest, isServerDatabaseConfigured } from "@/lib/server-db";
import type { Retailer } from "@/lib/types";

type Credential = {
  password_salt: string;
  password_hash: string;
};

type Profile = Retailer & {
  role?: unknown;
  auth_version?: unknown;
};

const dummyCredential: Credential = {
  password_salt: "ZHVtbXktY3VzdG9tLWF1dGgtc2FsdA",
  password_hash: Buffer.alloc(64).toString("base64url"),
};

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

  let input: { phone?: unknown; password?: unknown };
  try {
    input = (await request.json()) as { phone?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (typeof input.phone !== "string" || typeof input.password !== "string" || !input.phone.trim() || !input.password) {
    return NextResponse.json({ message: "กรุณาระบุเบอร์โทรศัพท์และรหัสผ่าน" }, { status: 400 });
  }
  if (input.password.length > 128) {
    return NextResponse.json({ message: "เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  if (!isThaiMobilePhone(input.phone)) {
    return NextResponse.json({ message: "กรุณากรอกเบอร์มือถือไทยให้ถูกต้อง" }, { status: 400 });
  }

  try {
    const phone = normalizePhone(input.phone);
    const profiles = await adminRequest<Profile[]>(
      `/rest/v1/profiles?select=id,shop_name,phone,role,auth_version&phone=eq.${encodeURIComponent(phone)}`,
    );
    const profile = profiles[0];
    const authVersion = profile?.auth_version;
    const credentials = profile
      ? await adminRequest<Credential[]>(
        `/rest/v1/app_credentials?select=password_salt,password_hash&profile_id=eq.${encodeURIComponent(profile.id)}`,
      )
      : [];
    const credential = credentials[0] || dummyCredential;
    const passwordMatches = await verifyPassword(input.password, credential.password_salt, credential.password_hash);
    if (
      !profile ||
      !isRole(profile.role) ||
      typeof authVersion !== "number" ||
      !Number.isInteger(authVersion) ||
      authVersion < 1 ||
      !credentials[0] ||
      !passwordMatches
    ) {
      return NextResponse.json({ message: "เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }

    const session = createCustomSession(profile.id, authVersion);
    const response = NextResponse.json({
      redirectTo: roleDashboardPath[profile.role],
      role: profile.role,
      session: {
        expires_at: session.expiresAt,
        user: { id: profile.id, phone: profile.phone || phone },
      },
    });
    response.cookies.set(CUSTOM_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CUSTOM_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ";
    const migrationMissing = /app_credentials|auth_version|custom_register_retailer|relation/i.test(message);
    return NextResponse.json(
      { message: migrationMissing ? "ยังไม่ได้รัน supabase/custom-auth-migration.sql" : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
