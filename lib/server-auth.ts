import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOM_SESSION_COOKIE, readCustomSession } from "@/lib/custom-session";
import { isRole, roleDashboardPath } from "@/lib/role-routes";
import { adminRequest } from "@/lib/server-db";
import type { Retailer, Role } from "@/lib/types";

export const ACCESS_TOKEN_COOKIE = CUSTOM_SESSION_COOKIE;

type StoredProfile = Retailer & {
  role?: unknown;
  auth_version?: unknown;
};

export type ServerAuth = {
  user: {
    id: string;
    phone?: string | null;
  };
  profile: Retailer & { role: Role };
  expiresAt: number;
};

export async function getServerAuth(): Promise<ServerAuth | null> {
  const token = (await cookies()).get(CUSTOM_SESSION_COOKIE)?.value;
  const session = readCustomSession(token);
  if (!session) return null;

  try {
    const profiles = await adminRequest<StoredProfile[]>(
      `/rest/v1/profiles?select=id,shop_name,phone,role,auth_version&id=eq.${encodeURIComponent(session.sub)}`,
    );
    const profile = profiles[0];
    if (
      !profile ||
      !isRole(profile.role) ||
      !Number.isInteger(profile.auth_version) ||
      profile.auth_version !== session.av
    ) return null;

    return {
      user: { id: profile.id, phone: profile.phone || null },
      profile: { ...profile, role: profile.role },
      expiresAt: session.exp,
    };
  } catch {
    return null;
  }
}

export async function requireRole(role: Role): Promise<ServerAuth> {
  const auth = await getServerAuth();
  if (!auth) redirect("/login");
  if (auth.profile.role !== role) redirect(roleDashboardPath[auth.profile.role]);
  return auth;
}

export async function redirectToDashboardForSession() {
  const auth = await getServerAuth();
  if (!auth) redirect("/login");
  redirect(roleDashboardPath[auth.profile.role]);
}
