import Link from "next/link";
import { Brand } from "@/components/brand";

const roles = [
  {
    code: "01",
    title: "OWNER",
    label: "เจ้าของร้าน",
    text: "ดูสต็อกที่ต้องดูแลก่อน ใบรวมสินค้า และเส้นทางการส่งได้จากที่เดียว",
    tone: "bg-[#fef1e8] text-[#bd5730]",
  },
  {
    code: "02",
    title: "ADMIN",
    label: "แอดมินคลัง",
    text: "ปรับจำนวนสินค้าคงเหลือได้อย่างคล่องตัว พร้อมเห็นสถานะทั้งคลัง",
    tone: "bg-[#e7f2ee] text-[#1c7968]",
  },
  {
    code: "03",
    title: "EMPLOYEE",
    label: "พนักงาน",
    text: "จัดการรายการของแต่ละร้าน ปิดงาน และส่งพิกัดให้ทุกคนเห็น",
    tone: "bg-[#eef0fc] text-[#5665ab]",
  },
  {
    code: "04",
    title: "RETAILER",
    label: "ผู้ค้าปลีก",
    text: "เลือกสินค้าเข้าตะกร้า สรุปราคา และติดตามคนส่งแบบเรียลไทม์",
    tone: "bg-[#fff5d9] text-[#a27116]",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#fbfaf5] text-[#11221f]">
      <header className="relative z-20 mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-7 text-sm font-bold text-[#4f625c] md:flex">
          <a href="#features" className="transition hover:text-[#0e4d43]">ความสามารถ</a>
          <a href="#roles" className="transition hover:text-[#0e4d43]">สิทธิ์การใช้งาน</a>
          <a href="#how-it-works" className="transition hover:text-[#0e4d43]">เริ่มต้นใช้งาน</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link href="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-extrabold text-[#0e4d43] transition hover:bg-[#e7f2ee] sm:block">
            เข้าสู่ระบบ
          </Link>
          <Link href="/register" className="rounded-xl bg-[#0e4d43] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(14,77,67,.2)] transition hover:-translate-y-0.5 hover:bg-[#0a4038] sm:px-5">
            สมัครร้านค้า <span className="ml-1 text-[#9fdfc7]">→</span>
          </Link>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1320px] gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:px-10 lg:pb-28 lg:pt-20">
          <div className="pointer-events-none absolute -left-24 top-0 h-[370px] w-[370px] rounded-full bg-[#dcefe7] blur-3xl" />
          <div className="pointer-events-none absolute right-[-130px] top-7 h-[380px] w-[380px] rounded-full bg-[#f9ddce] blur-3xl" />

          <div className="relative z-10 flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#b8d8ca] bg-white/80 px-3.5 py-2 text-xs font-extrabold text-[#0e4d43] shadow-sm backdrop-blur">
              <span className="flex h-2 w-2 rounded-full bg-[#32ad76] shadow-[0_0_0_4px_rgba(50,173,118,.15)]" />
              ระบบค้าส่งที่ทุกฝ่ายทำงานร่วมกันได้
            </div>
            <h1 className="max-w-[700px] text-[46px] font-black leading-[1.08] tracking-[-.065em] text-[#11221f] sm:text-6xl lg:text-[74px]">
              ค้าส่งที่คล่องตัว
              <span className="block text-[#0e4d43]">เริ่มที่สต็อกเดียว</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-8 text-[#52655f] sm:text-lg">
              123พาณิชย์ปลีกส่ง เชื่อมเจ้าของร้าน คลังสินค้า พนักงานส่งของ และผู้ค้าปลีกไว้ในระบบเดียว ตั้งแต่สินค้าเข้าคลังจนถึงหน้าร้านลูกค้า
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#f27d52] px-6 py-4 text-[15px] font-extrabold text-white shadow-[0_14px_30px_rgba(242,125,82,.28)] transition hover:-translate-y-0.5 hover:bg-[#e86d43]">
                เปิดร้านค้าของคุณ
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/20 text-lg leading-none">→</span>
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#c9ded5] bg-white/80 px-6 py-4 text-[15px] font-extrabold text-[#0e4d43] transition hover:border-[#0e4d43] hover:bg-white">
                <span className="text-lg">◫</span> เข้าสู่ระบบร้านค้า
              </Link>
            </div>
            <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4 text-sm font-bold text-[#496159]">
              <span className="inline-flex items-center gap-2"><span className="text-[#1d8b71]">✓</span> สั่งแบบกล่องหรือแพ็ค</span>
              <span className="inline-flex items-center gap-2"><span className="text-[#1d8b71]">✓</span> ตามตำแหน่งพนักงานได้</span>
              <span className="inline-flex items-center gap-2"><span className="text-[#1d8b71]">✓</span> แยกสิทธิ์ชัดเจน</span>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[600px] lg:pt-4">
            <div className="absolute -right-5 -top-6 h-32 w-32 rounded-full border-[18px] border-[#f5c8b3] opacity-80" />
            <div className="relative rounded-[32px] border border-white/80 bg-[#0e4d43] p-3 shadow-[0_35px_90px_rgba(18,66,57,.28)]">
              <div className="rounded-[24px] bg-[#f7f8f2] px-5 pb-5 pt-4 sm:px-6">
                <div className="flex items-center justify-between border-b border-[#dce7e2] pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0e4d43] text-xs font-black text-white">123</span>
                    <div>
                      <p className="text-xs font-black text-[#173b34]">ภาพรวมร้านค้า</p>
                      <p className="text-[10px] font-semibold text-[#739087]">อัปเดตเมื่อสักครู่</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#e5f4eb] px-2.5 py-1 text-[10px] font-black text-[#177a58]">● ออนไลน์</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 py-4 sm:gap-3">
                  {[
                    ["สินค้า", "128", "รายการ", "bg-[#e5f3ed] text-[#0e4d43]"],
                    ["ต้องเติม", "08", "รายการ", "bg-[#fff0e9] text-[#c25c39]"],
                    ["กำลังส่ง", "03", "ร้าน", "bg-[#eeeefb] text-[#5e62a8]"],
                  ].map(([label, value, sub, color]) => (
                    <div key={label} className="rounded-2xl border border-[#e0e9e5] bg-white p-3 shadow-sm sm:p-3.5">
                      <p className="text-[10px] font-bold text-[#7c9189]">{label}</p>
                      <p className="mt-1 text-2xl font-black tracking-tight text-[#183b34]">{value}</p>
                      <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[9px] font-black ${color}`}>{sub}</span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1.18fr_.82fr]">
                  <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-[#e1ebe6]">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black text-[#21463e]">สินค้าใกล้หมด</p>
                      <span className="text-[10px] font-bold text-[#1d8b71]">ดูทั้งหมด →</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {[
                        ["นมยูเอชที", "8", "#f4c6a8"],
                        ["น้ำดื่มใส", "12", "#acd8da"],
                        ["ข้าวหอมมะลิ", "18", "#e6d6ae"],
                      ].map(([name, count, color]) => (
                        <div key={name} className="flex items-center gap-2.5">
                          <span className="h-7 w-7 rounded-lg" style={{ backgroundColor: color }} />
                          <span className="flex-1 text-[10px] font-bold text-[#466058]">{name}</span>
                          <span className="rounded-md bg-[#fff0e9] px-1.5 py-0.5 text-[9px] font-black text-[#c45b38]">{count} เหลือ</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#dcefe7] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-[#0e4d43]">ติดตามพนักงาน</span>
                      <span className="flex h-2 w-2 rounded-full bg-[#f27d52]" />
                    </div>
                    <div className="relative mt-3 h-[95px] overflow-hidden rounded-xl bg-[#c8e0d6]">
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 180 100" fill="none" aria-hidden="true">
                        <path d="M5 77C33 75 42 17 76 38C106 57 114 79 173 19" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
                        <path d="M5 77C33 75 42 17 76 38C106 57 114 79 173 19" stroke="#f27d52" strokeWidth="2.5" strokeDasharray="4 5" />
                      </svg>
                      <span className="absolute bottom-3 left-5 grid h-7 w-7 place-items-center rounded-full bg-[#0e4d43] text-[11px] text-white shadow-lg">⌁</span>
                      <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-xs shadow-lg">🏪</span>
                    </div>
                    <p className="mt-2 text-[9px] font-bold text-[#397668]">รถกำลังถึงร้านเจริญทรัพย์</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="soft-float absolute -bottom-8 -left-5 rounded-2xl border border-white bg-white px-4 py-3 shadow-[0_14px_30px_rgba(18,66,57,.14)] sm:-left-10">
              <p className="text-[10px] font-bold text-[#789087]">คำสั่งซื้อวันนี้</p>
              <p className="mt-0.5 text-xl font-black text-[#0e4d43]">฿ 24,860</p>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-[#dce7e2] bg-white/70 py-7">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
            <p className="text-sm font-extrabold text-[#476057]">ทุกบทบาทเห็นข้อมูลที่ต้องใช้ <span className="text-[#0e4d43]">โดยไม่ต้องไล่ตามกันในแชต</span></p>
            <div className="flex flex-wrap gap-x-7 gap-y-2 text-xs font-bold text-[#61776e]">
              <span>คลังสินค้าเดียวกัน</span><span>•</span><span>ออเดอร์เดียวกัน</span><span>•</span><span>พิกัดเดียวกัน</span>
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-black tracking-[.17em] text-[#e46c43]">ONE SYSTEM, FOUR ROLES</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-.045em] text-[#11221f] sm:text-5xl">ให้แต่ละคนเห็นเฉพาะสิ่งที่ต้องทำ</h2>
            <p className="mt-4 text-[17px] leading-8 text-[#61766e]">แยกสิทธิ์ชัดเจน ลดข้อมูลซ้ำซ้อน แต่ยังทำให้งานของทุกฝ่ายต่อเนื่องกัน</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {roles.map((role) => (
              <article key={role.title} className="group rounded-[26px] border border-[#dce7e2] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(18,66,57,.1)]">
                <div className="flex items-start justify-between">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl text-sm font-black ${role.tone}`}>{role.code}</span>
                  <span className="text-sm font-black text-[#a2b5ae] transition group-hover:text-[#0e4d43]">↗</span>
                </div>
                <p className="mt-7 text-xs font-black tracking-[.15em] text-[#1d8b71]">{role.title}</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-[#173b34]">{role.label}</h3>
                <p className="mt-3 text-sm leading-6 text-[#667a72]">{role.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1320px] px-5 pb-24 sm:px-8 lg:px-10">
          <div className="grid overflow-hidden rounded-[32px] bg-[#0e4d43] lg:grid-cols-[.86fr_1.14fr]">
            <div className="p-8 text-white sm:p-12">
              <p className="text-xs font-black tracking-[.16em] text-[#a6ddca]">เริ่มต้นใน 3 ขั้นตอน</p>
              <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-.05em]">เปลี่ยนงานหลังร้าน<br />ให้เดินหน้าเอง</h2>
              <p className="mt-5 max-w-sm text-[15px] leading-7 text-[#c3e4d6]">เริ่มจากผู้ค้าปลีกลงทะเบียน แล้วระบบจะช่วยต่อข้อมูลไปยังคลังและพนักงานโดยอัตโนมัติ</p>
              <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#f27d52] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#e66b41]">สร้างบัญชีผู้ค้าปลีก <span>→</span></Link>
            </div>
            <div className="grid gap-px bg-[#388678] sm:grid-cols-3">
              {[
                ["01", "ลงทะเบียน", "ใช้เบอร์โทร ชื่อร้าน และรหัสผ่าน — ผู้สมัครใหม่เป็นผู้ค้าปลีกทันที"],
                ["02", "จัดการคลัง", "OWNER และ ADMIN อัปเดตสินค้า ส่วนพนักงานรับงานตามร้านค้า"],
                ["03", "ส่งถึงหน้าร้าน", "พนักงานปิดงานและแชร์พิกัด เพื่อให้เจ้าของและผู้ค้าปลีกติดตามได้"],
              ].map(([step, title, text]) => (
                <div key={step} className="bg-[#146153] p-7 sm:p-8">
                  <p className="text-sm font-black text-[#a6ddca]">{step}</p>
                  <h3 className="mt-10 text-xl font-black text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#c5e6da]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dce7e2] px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Brand compact />
          <p className="text-xs font-medium text-[#72877f]">© 2026 123พาณิชย์ปลีกส่ง · ระบบจัดการค้าส่ง</p>
        </div>
      </footer>
    </div>
  );
}
