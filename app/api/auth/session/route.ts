import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";

export async function GET() {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  return NextResponse.json({
    profile: auth.profile,
    expires_at: auth.expiresAt,
    user: auth.user,
  });
}
