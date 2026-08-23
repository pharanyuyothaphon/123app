import Link from "next/link";

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="123พาณิชย์ปลีกส่ง หน้าแรก">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f27d52] text-[15px] font-black tracking-[-.1em] text-white shadow-[0_7px_18px_rgba(242,125,82,.28)] transition group-hover:-rotate-3 group-hover:scale-105">
        123
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className={`block text-[15px] font-extrabold tracking-tight ${light ? "text-white" : "text-[#11221f]"}`}>
            พาณิชย์ปลีกส่ง
          </span>
          <span className={`block text-[10px] font-semibold tracking-[.14em] ${light ? "text-emerald-100/75" : "text-emerald-800/60"}`}>
            WHOLESALE CONTROL
          </span>
        </span>
      )}
    </Link>
  );
}
