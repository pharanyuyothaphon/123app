import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const sourceLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const localEnv = readEnvFile(resolve(process.cwd(), ".env.local"));
const env = { ...process.env, ...localEnv };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const resetPasswords = process.argv.includes("--reset-passwords");

function requireValue(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`ยังไม่ได้กำหนด ${name} ใน .env.local`);
  return value;
}

function requirePassword(name) {
  const password = requireValue(name);
  if (password.length < 8 || password.length > 128) {
    throw new Error(`${name} ต้องมีความยาว 8–128 ตัวอักษร`);
  }
  return password;
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("66")) return `+${digits}`;
  if (digits.startsWith("0")) return `+66${digits.slice(1)}`;
  if (/^[689]\d{8}$/.test(digits)) return `+66${digits}`;
  return `+${digits}`;
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function requireThaiMobilePhone(name) {
  const phone = normalizePhone(requireValue(name));
  if (!/^\+66[689]\d{8}$/.test(phone)) {
    throw new Error(`${name} ต้องเป็นเบอร์มือถือไทยที่ถูกต้อง`);
  }
  return phone;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  return { salt, hash: Buffer.from(derived).toString("base64url") };
}

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null
      ? payload.message || payload.error_description || payload.msg || payload.hint || payload.details
      : null;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return payload;
}

async function findProfileByPhone(phone) {
  const select = "select=id,phone,shop_name,role,auth_version";
  const exactProfiles = await request(`/rest/v1/profiles?${select}&phone=eq.${encodeURIComponent(phone)}`, { method: "GET" });
  if (exactProfiles[0]) return exactProfiles[0];

  // รองรับ profile เก่าที่เคยบันทึกเบอร์คนละรูปแบบ เช่น 081... แทน +6681...
  const profiles = await request(`/rest/v1/profiles?${select}&order=created_at.asc`, { method: "GET" });
  const targetDigits = phoneDigits(phone);
  return profiles.find((profile) => phoneDigits(profile.phone) === targetDigits) || null;
}

async function createProfile(account) {
  const rows = await request("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: randomUUID(),
      phone: account.phone,
      shop_name: account.shopName,
      role: account.role,
    }),
  });
  if (!rows[0]?.id) throw new Error(`สร้าง profile ${account.role} ไม่สำเร็จ`);
  return rows[0];
}

async function updateProfile(profile, account) {
  const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ phone: account.phone, shop_name: account.shopName, role: account.role }),
  });
  if (!rows[0]?.id) throw new Error(`อัปเดต profile ${account.role} ไม่สำเร็จ`);
  return rows[0];
}

async function hasCredential(profileId) {
  const rows = await request(`/rest/v1/app_credentials?select=profile_id&profile_id=eq.${encodeURIComponent(profileId)}`, {
    method: "GET",
  });
  return Boolean(rows[0]?.profile_id);
}

async function saveCredential(profileId, password, invalidateSessions) {
  const credential = await hashPassword(password);
  await request("/rest/v1/rpc/custom_set_profile_credential", {
    method: "POST",
    body: JSON.stringify({
      p_profile_id: profileId,
      p_password_salt: credential.salt,
      p_password_hash: credential.hash,
      p_invalidate_sessions: invalidateSessions,
    }),
  });
}

async function advanceAuthVersion(profile) {
  const currentVersion = Number.isInteger(profile.auth_version) && profile.auth_version > 0 ? profile.auth_version : 1;
  const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ auth_version: currentVersion + 1 }),
  });
  if (!rows[0]?.id) throw new Error("ไม่สามารถยกเลิก session เดิมได้");
}

async function main() {
  if (!supabaseUrl) throw new Error("ยังไม่ได้กำหนด NEXT_PUBLIC_SUPABASE_URL ใน .env.local");
  if (!serviceRoleKey) throw new Error("ยังไม่ได้กำหนด SUPABASE_SERVICE_ROLE_KEY ใน .env.local");

  const accounts = [
    { role: "OWNER", phone: requireThaiMobilePhone("BOOTSTRAP_OWNER_PHONE"), password: requirePassword("BOOTSTRAP_OWNER_PASSWORD"), shopName: env.BOOTSTRAP_OWNER_SHOP_NAME || "123พาณิชย์ปลีกส่ง" },
    { role: "ADMIN", phone: requireThaiMobilePhone("BOOTSTRAP_ADMIN_PHONE"), password: requirePassword("BOOTSTRAP_ADMIN_PASSWORD"), shopName: env.BOOTSTRAP_ADMIN_SHOP_NAME || "ผู้ดูแลคลังสินค้า" },
    { role: "EMPLOYEE", phone: requireThaiMobilePhone("BOOTSTRAP_EMPLOYEE_PHONE"), password: requirePassword("BOOTSTRAP_EMPLOYEE_PASSWORD"), shopName: env.BOOTSTRAP_EMPLOYEE_SHOP_NAME || "พนักงานจัดส่ง" },
  ];

  for (const account of accounts) {
    const existing = await findProfileByPhone(account.phone);
    const created = !existing;
    const profileChanged = Boolean(existing && (
      existing.phone !== account.phone ||
      existing.shop_name !== account.shopName ||
      existing.role !== account.role
    ));
    if (existing && profileChanged) {
      // ยกเลิก session ก่อนเปลี่ยน Role เพื่อไม่ให้สิทธิ์ใหม่มีช่วงเวลาค้างอยู่ใน session เก่า
      await advanceAuthVersion(existing);
    }
    const profile = created ? await createProfile(account) : await updateProfile(existing, account);
    const credentialExists = await hasCredential(profile.id);

    if (!credentialExists || resetPasswords) {
      await saveCredential(profile.id, account.password, !created && !profileChanged);
    }

    const action = created ? "สร้างบัญชี" : resetPasswords ? "รีเซ็ตรหัสผ่าน" : credentialExists ? "พบบัญชี" : "ตั้งรหัสผ่านเริ่มต้น";
    console.log(`${action} ${account.role}: ${account.phone} · กำหนดสิทธิ์เรียบร้อย`);
  }

  console.log(resetPasswords
    ? "เสร็จแล้ว: รหัสผ่านใหม่ของ OWNER, ADMIN และ EMPLOYEE ตรงกับค่าที่กำหนดใน .env.local และ session เดิมถูกยกเลิก"
    : "เสร็จแล้ว: OWNER, ADMIN และ EMPLOYEE สามารถเข้าสู่ระบบด้วยเบอร์และรหัสผ่านที่กำหนดใน .env.local");
  console.log("RETAILER สมัครบัญชีของตนเองผ่านหน้า /register");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const migrationMissing = /app_credentials|auth_version|custom_|relation|column/i.test(message);
  console.error(`ไม่สามารถตั้งค่าบัญชี Role ได้: ${migrationMissing ? "โปรดรัน supabase/custom-auth-migration.sql ใน Supabase SQL Editor ก่อน" : message}`);
  process.exitCode = 1;
});
