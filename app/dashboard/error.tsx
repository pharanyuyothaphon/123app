"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Keep useful context in the browser console without exposing details to users.
    console.error("Dashboard render failed", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8f4] px-5 text-[#173f35]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dbe8e2] bg-white p-7 text-center shadow-[0_20px_55px_rgba(23,67,57,.12)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e9] text-2xl font-black text-[#c45c37]">!</span>
        <h1 className="mt-5 text-2xl font-black tracking-tight">เปิดหน้าการทำงานไม่สำเร็จ</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b8379]">การเชื่อมต่ออาจสะดุดชั่วคราว ลองโหลดหน้านี้อีกครั้งได้ทันที</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={retry} className="rounded-xl bg-[#0e4d43] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0a4038]">ลองอีกครั้ง</button>
          <a href="/login" className="rounded-xl border border-[#d5e5dd] px-4 py-3 text-sm font-extrabold text-[#315f52] transition hover:bg-[#f2f7f4]">กลับหน้าเข้าสู่ระบบ</a>
        </div>
      </section>
    </main>
  );
}
