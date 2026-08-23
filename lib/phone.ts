export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("66")) return `+${digits}`;
  if (digits.startsWith("0")) return `+66${digits.slice(1)}`;
  // หน้าเว็บแสดง +66 อยู่แล้ว จึงรับเลขไทย 9 หลักที่กรอกโดยไม่มี 0 นำหน้า
  if (/^[689]\d{8}$/.test(digits)) return `+66${digits}`;
  return `+${digits}`;
}

export function isThaiMobilePhone(phone: string) {
  return /^\+66[689]\d{8}$/.test(normalizePhone(phone));
}
