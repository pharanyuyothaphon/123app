import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "123พาณิชย์ปลีกส่ง | จัดการร้านค้าส่งอย่างเป็นระบบ",
  description: "ระบบจัดการสินค้าส่ง การสั่งซื้อ และติดตามการจัดส่งสำหรับ 123พาณิชย์ปลีกส่ง",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
