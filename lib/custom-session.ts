import { createHmac, timingSafeEqual } from "node:crypto";

export const CUSTOM_SESSION_COOKIE = "123-custom-session";
export const CUSTOM_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  v: 1;
  sub: string;
  av: number;
  exp: number;
};

function getSessionSecret() {
  return process.env.CUSTOM_AUTH_SESSION_SECRET?.trim() || null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function isCustomSessionConfigured() {
  return Boolean(getSessionSecret());
}

export function createCustomSession(profileId: string, authVersion: number) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("ยังไม่ได้ตั้งค่า CUSTOM_AUTH_SESSION_SECRET");
  if (!Number.isInteger(authVersion) || authVersion < 1) {
    throw new Error("ข้อมูลสิทธิ์ผู้ใช้ไม่ถูกต้อง");
  }

  const payload: SessionPayload = {
    v: 1,
    sub: profileId,
    av: authVersion,
    exp: Math.floor(Date.now() / 1000) + CUSTOM_SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encodedPayload}.${sign(encodedPayload, secret)}`,
    expiresAt: payload.exp,
  };
}

export function readCustomSession(token: string | undefined) {
  const secret = getSessionSecret();
  if (!token || !secret) return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      payload.v !== 1 ||
      typeof payload.sub !== "string" ||
      !Number.isInteger(payload.av) ||
      (payload.av as number) < 1 ||
      typeof payload.exp !== "number"
    ) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
