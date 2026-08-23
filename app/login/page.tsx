"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand } from "@/components/brand";
import { signInWithPhone } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    setPending(true);
    try {
      const result = await signInWithPhone(phone, password);
      router.replace(result.redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#f7f7f1] lg:grid-cols-[.92fr_1.08fr]">
      <div className="pointer-events-none absolute -left-32 top-28 h-96 w-96 rounded-full bg-[#cfe9dd] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-170px] right-[-120px] h-[470px] w-[470px] rounded-full bg-[#f8d5c4] blur-3xl" />

      <section className="relative z-10 hidden min-h-screen flex-col justify-between bg-[#0e4d43] p-10 text-white lg:flex xl:p-14">
        <Brand light />
        <div className="max-w-md">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#bce4d5]">
            <span className="h-2 w-2 rounded-full bg-[#f27d52]" /> 123 WHOLESALE SYSTEM
          </div>
          <h1 className="text-5xl font-black leading-[1.05] tracking-[-.06em]">งานหลังร้าน<br />ที่ไปต่อกันได้</h1>
          <p className="mt-6 text-[16px] leading-8 text-[#c1e0d5]">เข้าถึงเครื่องมือเฉพาะหน้าที่ของคุณ พร้อมข้อมูลที่เชื่อมถึงกันทั้งร้านและคลังสินค้า</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[.07] p-5">
          <div className="flex items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f27d52] text-xl">⌁</span>
            <div>
              <p className="text-sm font-black">ออเดอร์กำลังนำส่ง</p>
              <p className="mt-0.5 text-xs text-[#b8d9ce]">ร้านเจริญทรัพย์ มินิมาร์ท · อัปเดตเมื่อ 2 นาที</p>
            </div>
            <span className="ml-auto h-2.5 w-2.5 rounded-full bg-[#65d5a2] shadow-[0_0_0_5px_rgba(101,213,162,.13)]" />
          </div>
        </div>
      </section>

      <section className="relative z-10 flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-[490px]">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Brand />
            <Link href="/" className="text-sm font-bold text-[#527066]">← หน้าแรก</Link>
          </div>
          <Link href="/" className="mb-10 hidden w-fit items-center gap-2 text-sm font-bold text-[#527066] transition hover:text-[#0e4d43] lg:inline-flex">← กลับหน้าแรก</Link>
          <div className="rounded-[30px] border border-white/80 bg-white/85 p-6 shadow-[0_25px_60px_rgba(23,67,57,.12)] backdrop-blur sm:p-8">
            <span className="inline-flex rounded-xl bg-[#e5f3ed] px-3 py-1.5 text-[11px] font-black tracking-[.12em] text-[#19735f]">WELCOME BACK</span>
            <h2 className="mt-4 text-3xl font-black tracking-[-.045em] text-[#14372f]">เข้าสู่ระบบ</h2>
            <p className="mt-2 text-sm leading-6 text-[#688078]">ใช้เบอร์โทรศัพท์และรหัสผ่านที่ลงทะเบียนไว้</p>

            <form className="mt-7 space-y-4" onSubmit={handleLogin}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">เบอร์โทรศัพท์</span>
                <div className="flex overflow-hidden rounded-xl border border-[#d2e1da] bg-[#fbfcfa] transition focus-within:border-[#208168] focus-within:ring-4 focus-within:ring-[#cceadf]">
                  <span className="flex items-center border-r border-[#dbe7e1] px-3 text-sm font-extrabold text-[#0e4d43]">+66</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="8x-xxx-xxxx"
                    className="w-full bg-transparent px-3 py-3.5 text-sm font-semibold text-[#173b34] outline-none placeholder:text-[#a8bab3]"
                    required
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-[#466259]">รหัสผ่าน</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="กรอกรหัสผ่านของคุณ"
                  className="w-full rounded-xl border border-[#d2e1da] bg-[#fbfcfa] px-3.5 py-3.5 text-sm font-semibold text-[#173b34] outline-none transition placeholder:text-[#a8bab3] focus:border-[#208168] focus:ring-4 focus:ring-[#cceadf]"
                  required
                />
              </label>
              {message && <p className="rounded-xl bg-[#fff3ee] px-3.5 py-3 text-sm font-semibold leading-6 text-[#b75533]">{message}</p>}
              <button disabled={pending} type="submit" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0e4d43] py-3.5 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(14,77,67,.2)] transition hover:bg-[#0a4038] disabled:cursor-not-allowed disabled:opacity-60">
                {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"} <span className="text-[#a2ddc7]">→</span>
              </button>
            </form>

            <p className="mt-6 text-center text-sm font-medium text-[#687e76]">ยังไม่มีบัญชีผู้ค้าปลีก? <Link href="/register" className="font-extrabold text-[#0e4d43] underline decoration-[#8fcab6] underline-offset-4">ลงทะเบียนร้านค้า</Link></p>
          </div>

        </div>
      </section>
    </main>
  );
}
