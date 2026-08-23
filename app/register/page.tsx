"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand } from "@/components/brand";
import { registerRetailer } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("รหัสผ่านยืนยันไม่ตรงกัน");
      return;
    }
    setPending(true);
    try {
      await registerRetailer(phone, shopName.trim(), password);
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fbfaf5] px-5 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1180px]">
        <header className="flex items-center justify-between">
          <Brand />
          <p className="text-sm font-bold text-[#60756d]">มีบัญชีแล้ว? <Link href="/login" className="text-[#0e4d43] underline decoration-[#a3d4c2] underline-offset-4">เข้าสู่ระบบ</Link></p>
        </header>
        <div className="mt-8 grid overflow-hidden rounded-[34px] border border-[#dce7e2] bg-white shadow-[0_24px_60px_rgba(19,67,56,.1)] lg:grid-cols-[.92fr_1.08fr]">
          <aside className="relative overflow-hidden bg-[#e5f2ec] p-7 sm:p-10 lg:p-12">
            <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-[#b9decf]" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-[#f6c9b5]" />
            <div className="relative">
              <span className="inline-flex rounded-full border border-[#b8d8ca] bg-white/80 px-3 py-1.5 text-[10px] font-black tracking-[.14em] text-[#16735f]">RETAILER ONBOARDING</span>
              <h1 className="mt-5 max-w-sm text-4xl font-black leading-[1.1] tracking-[-.055em] text-[#113d34]">เปิดร้านของคุณ<br />เข้าระบบค้าส่ง</h1>
              <p className="mt-5 max-w-sm text-[15px] leading-7 text-[#58766c]">ลงทะเบียนเพียงเบอร์โทร ชื่อร้าน และรหัสผ่าน เมื่อสำเร็จ ร้านของคุณจะแสดงให้พนักงานจัดการงานได้อัตโนมัติ</p>
              <ol className="mt-10 space-y-5">
                {[
                  ["01", "สร้างบัญชีร้านค้า", "คุณจะได้รับสิทธิ์ผู้ค้าปลีกทันที"],
                  ["02", "เลือกสินค้าเข้าตะกร้า", "สั่งได้ทั้งแบบกล่องและแบบแพ็ค"],
                  ["03", "ติดตามการนำส่ง", "เห็นตำแหน่งพนักงานระหว่างจัดส่ง"],
                ].map(([number, title, text]) => (
                  <li key={number} className="flex gap-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#0e4d43] text-[10px] font-black text-white">{number}</span>
                    <span><strong className="block text-sm font-black text-[#224b41]">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-[#69857b]">{text}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
          <section className="p-7 sm:p-10 lg:p-12">
            {success ? (
              <div className="flex h-full min-h-[440px] flex-col items-center justify-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#dff3e8] text-3xl text-[#19775e]">✓</span>
                <h2 className="mt-6 text-3xl font-black tracking-[-.04em] text-[#143b32]">สร้างบัญชีเรียบร้อย</h2>
                <p className="mt-3 max-w-sm text-sm leading-7 text-[#627b72]">ระบบส่งข้อมูลร้านค้าเข้าฐานข้อมูลแล้ว คุณสามารถเข้าสู่ระบบเพื่อเลือกสินค้าได้ทันที</p>
                <button onClick={() => router.push("/login")} className="mt-7 rounded-xl bg-[#0e4d43] px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_25px_rgba(14,77,67,.18)]">ไปหน้าเข้าสู่ระบบ →</button>
              </div>
            ) : (
              <>
                <span className="text-[11px] font-black tracking-[.14em] text-[#e06b44]">CREATE YOUR STORE</span>
                <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#143b32]">ลงทะเบียนผู้ค้าปลีก</h2>
                <p className="mt-2 text-sm leading-6 text-[#70857d]">ข้อมูลนี้ใช้สำหรับเข้าสู่ระบบและแสดงรายชื่อร้านให้ทีมจัดส่ง</p>
                <form onSubmit={handleRegister} className="mt-7 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">ชื่อร้านค้า</span>
                    <input value={shopName} onChange={(event) => setShopName(event.target.value)} placeholder="เช่น ร้านเจริญทรัพย์ มินิมาร์ท" className="w-full rounded-xl border border-[#d2e1da] bg-[#fbfcfa] px-3.5 py-3.5 text-sm font-semibold text-[#173b34] outline-none transition placeholder:text-[#abbdb6] focus:border-[#208168] focus:ring-4 focus:ring-[#cceadf]" required />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">เบอร์โทรศัพท์</span>
                    <div className="flex overflow-hidden rounded-xl border border-[#d2e1da] bg-[#fbfcfa] transition focus-within:border-[#208168] focus-within:ring-4 focus-within:ring-[#cceadf]">
                      <span className="flex items-center border-r border-[#dbe7e1] px-3 text-sm font-extrabold text-[#0e4d43]">+66</span>
                      <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="8x-xxx-xxxx" className="w-full bg-transparent px-3 py-3.5 text-sm font-semibold text-[#173b34] outline-none placeholder:text-[#abbdb6]" required />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">รหัสผ่าน</span>
                    <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร" className="w-full rounded-xl border border-[#d2e1da] bg-[#fbfcfa] px-3.5 py-3.5 text-sm font-semibold text-[#173b34] outline-none transition placeholder:text-[#abbdb6] focus:border-[#208168] focus:ring-4 focus:ring-[#cceadf]" required />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">ยืนยันรหัสผ่าน</span>
                    <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="กรอกรหัสผ่านอีกครั้ง" className="w-full rounded-xl border border-[#d2e1da] bg-[#fbfcfa] px-3.5 py-3.5 text-sm font-semibold text-[#173b34] outline-none transition placeholder:text-[#abbdb6] focus:border-[#208168] focus:ring-4 focus:ring-[#cceadf]" required />
                  </label>
                  {message && <p className="sm:col-span-2 rounded-xl bg-[#fff3ee] px-3.5 py-3 text-sm font-semibold leading-6 text-[#b75533]">{message}</p>}
                  <button disabled={pending} type="submit" className="sm:col-span-2 mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#f27d52] py-3.5 text-sm font-extrabold text-white shadow-[0_12px_25px_rgba(242,125,82,.23)] transition hover:bg-[#e86d43] disabled:cursor-not-allowed disabled:opacity-60">{pending ? "กำลังสร้างบัญชี..." : "สร้างบัญชีร้านค้า"} <span>→</span></button>
                </form>
                <p className="mt-5 text-xs leading-5 text-[#82958e]">เมื่อกดสร้างบัญชี ร้านค้าของคุณจะได้รับสิทธิ์ <strong className="font-black text-[#41665b]">RETAILER</strong> โดยอัตโนมัติ สิทธิ์อื่นตั้งค่าโดยผู้ดูแลระบบ</p>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
