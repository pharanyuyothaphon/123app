# 123พาณิชย์ปลีกส่ง

ระบบนี้ใช้ **Custom Auth**: เบอร์โทรศัพท์เป็นชื่อผู้ใช้, รหัสผ่านเก็บเป็น `scrypt hash` ใน Supabase และ session อยู่ใน HTTP-only cookie ของ Next.js

จึงไม่ใช้ Supabase Phone Auth, OTP, Twilio หรือ SMS provider ใด ๆ

## ติดตั้งครั้งแรก

### 1. สร้าง `.env.local`

คัดลอกไฟล์ `.env.example` เป็น `.env.local` แล้วกำหนดค่าเหล่านี้:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=วาง_service_role_key_จาก_Supabase
CUSTOM_AUTH_SESSION_SECRET=วางค่าสุ่มยาวๆ_ที่เก็บเป็นความลับ

BOOTSTRAP_OWNER_PHONE=0812345678
BOOTSTRAP_OWNER_PASSWORD=รหัสผ่าน_OWNER_อย่างน้อย_8_ตัว
BOOTSTRAP_OWNER_SHOP_NAME=123พาณิชย์ปลีกส่ง

BOOTSTRAP_ADMIN_PHONE=0812345679
BOOTSTRAP_ADMIN_PASSWORD=รหัสผ่าน_ADMIN_อย่างน้อย_8_ตัว
BOOTSTRAP_ADMIN_SHOP_NAME=ผู้ดูแลคลังสินค้า

BOOTSTRAP_EMPLOYEE_PHONE=0812345680
BOOTSTRAP_EMPLOYEE_PASSWORD=รหัสผ่าน_EMPLOYEE_อย่างน้อย_8_ตัว
BOOTSTRAP_EMPLOYEE_SHOP_NAME=พนักงานจัดส่ง
```

สร้าง `CUSTOM_AUTH_SESSION_SECRET` ด้วยคำสั่งนี้ใน PowerShell แล้วคัดลอกผลลัพธ์ไปใส่ใน `.env.local`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

`SUPABASE_SERVICE_ROLE_KEY` หาได้ที่ Supabase Dashboard > **Project Settings** > **API** > `service_role` / **Secret key**. ค่านี้และ `CUSTOM_AUTH_SESSION_SECRET` ห้ามใส่ในตัวแปร `NEXT_PUBLIC_*`, ห้ามส่งให้ใคร และห้าม commit ไฟล์ `.env.local` ขึ้น Git

### 2. ตั้งค่าฐานข้อมูล

เปิด Supabase Dashboard > **SQL Editor** แล้วรันตามลำดับ:

1. [supabase/schema.sql](supabase/schema.sql) — เฉพาะกรณียังไม่เคยสร้างตารางของโปรเจกต์นี้
2. [supabase/custom-auth-migration.sql](supabase/custom-auth-migration.sql) — **ต้องรันทุกกรณี** เพื่อเปลี่ยนระบบเป็น Custom Auth

Migration นี้ไม่ลบหรือแก้ไขข้อมูลเดิมใน `profiles`, สินค้า, ออเดอร์ หรือผู้ใช้เดิมใน Supabase Auth และไม่ลบ RLS policy, trigger หรือ RPC เดิมของคุณ ระบบเพิ่มเพียงตาราง `app_credentials`, คอลัมน์ `profiles.auth_version` (ค่าเริ่มต้น `1`) และ Custom RPC ใหม่

มีการเอา foreign key `profiles.id → auth.users.id` ออกเพียงจุดเดียว เพราะจำเป็นต่อการให้ RETAILER สมัครด้วย Custom Auth โดยไม่ต้องสร้าง Supabase Auth user; ค่า `id`, เบอร์โทร, ชื่อร้าน และ Role เดิมจะไม่เปลี่ยน

หากเป็นระบบที่มีข้อมูลใช้งานอยู่แล้ว ควรสร้าง backup หรือ branch ใน Supabase ก่อนรัน migration

### 3. สร้างรหัสสำหรับ OWNER / ADMIN / EMPLOYEE

จากโฟลเดอร์โปรเจกต์ รัน:

```powershell
npm run bootstrap:roles
```

คำสั่งนี้จะสร้างหรืออัปเดต profile ของ 3 Role ตามเบอร์ใน `.env.local` และสร้างรหัสผ่านแบบ hash ในตาราง `app_credentials` โดยไม่สร้าง Supabase Auth user และไม่พิมพ์รหัสผ่านออกมา

RETAILER ไม่ต้องใส่ใน `.env.local` ให้สมัครเองผ่านหน้า `/register` โดยใช้เบอร์โทรศัพท์ ชื่อร้าน และรหัสผ่านอย่างน้อย 8 ตัวอักษร ระบบจะกำหนด Role เป็น `RETAILER` โดยอัตโนมัติ

### 4. เริ่มระบบ

```powershell
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) แล้วเข้าสู่ระบบด้วยเบอร์โทรศัพท์และรหัสผ่าน:

- พิมพ์ได้ทั้ง `0812345678`, `812345678` หรือ `+66812345678`; ระบบจะแปลงเป็นรูปแบบเดียวกัน
- ไม่มี OTP และไม่มีการส่ง SMS
- หลังเข้าสู่ระบบ ระบบจะพาไป Dashboard ตาม Role โดยอัตโนมัติ

หากแก้ `.env.local` ต้องหยุดและเริ่ม `npm run dev` ใหม่หนึ่งครั้ง

## รีเซ็ตรหัสผ่านเอง

สำหรับ OWNER, ADMIN และ EMPLOYEE:

1. เปลี่ยน `BOOTSTRAP_*_PASSWORD` ที่ต้องการใน `.env.local`
2. รัน:

```powershell
npm run reset:role-passwords
```

คำสั่งนี้ตั้ง hash ใหม่และยกเลิก session เดิมของ Role นั้นทันที ผู้ใช้ต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่

## สิทธิ์แต่ละ Role

| Role | Dashboard | สิทธิ์ |
| --- | --- | --- |
| OWNER | `/dashboard/owner` | ดูสินค้าสต็อกน้อยก่อน, ค้นหา/เพิ่ม/ลด/ลบสินค้า, ดูออเดอร์และติดตามพนักงาน |
| ADMIN | `/dashboard/admin` | ดูสินค้าทั้งระบบและเพิ่ม/ลดสต็อก |
| EMPLOYEE | `/dashboard/employee` | เห็นร้าน/ออเดอร์ที่สมัครใหม่อัตโนมัติ, อัปเดตสถานะ และส่งพิกัด |
| RETAILER | `/dashboard/retailer` | เลือกสินค้า, สั่งซื้อ และเห็นเฉพาะออเดอร์/พิกัดของร้านตนเอง |

การจำกัดสิทธิ์เกิดทั้งหน้า Server Component, API route และ SQL RPC บน Supabase ดังนั้นการพิมพ์ URL ของ Role อื่นหรือเรียก API ตรงจะไม่ทำให้เข้าถึงข้อมูลเกินสิทธิ์ได้

## การดูแลความปลอดภัย

- เปลี่ยน `CUSTOM_AUTH_SESSION_SECRET` เมื่อต้องการออกจากระบบทุกคนทันที
- อย่าเปิดเผย `SUPABASE_SERVICE_ROLE_KEY`; แอปใช้ค่านี้เฉพาะฝั่ง Next.js server
- โปรดตั้งรหัสผ่าน 8 ตัวอักษรขึ้นไปและไม่ใช้ซ้ำกับบริการสำคัญอื่น
- ตาราง `app_credentials` เก็บเฉพาะ salt/hash ไม่มีรหัสผ่านจริง

## Tracking ตำแหน่งพนักงาน

1. พนักงานเปลี่ยนสถานะออเดอร์เป็น **เริ่มนำส่งสินค้า** — ระบบตัดสต็อกใน transaction เดียวตามจำนวน `กล่อง + แพ็ค` ของออเดอร์ และจะไม่เริ่มนำส่งหากสต็อกไม่พอ
2. กด **เริ่มแชร์ตำแหน่งจริง** และกดอนุญาต Location ในเบราว์เซอร์
3. ระบบบันทึก GPS ล่าสุดเมื่อพนักงานขยับอย่างน้อย 25 เมตร หรือทุก 15 วินาที แล้ว OWNER และ RETAILER จะเห็นข้อมูลใหม่ภายในประมาณ 10 วินาที
4. กด **หยุดแชร์ตำแหน่ง** หรือ **ส่งสำเร็จ** เพื่อหยุดการติดตาม

ระบบไม่มีพิกัดสุ่มแล้ว และพนักงานแชร์ได้เฉพาะออเดอร์ที่ตนได้รับมอบหมายและมีสถานะ `DELIVERING` เท่านั้น

หลังอัปเดตโค้ดนี้ ให้รัน [20260830_delivery_stock_deduction.sql](./supabase/migrations/20260830_delivery_stock_deduction.sql) ใน Supabase SQL Editor หนึ่งครั้ง เพื่ออัปเดต Custom RPC สำหรับการตัดสต็อก (คำสั่งใช้ `create or replace` จึงไม่ลบข้อมูลเดิม) หากยังไม่เคยตั้งค่า Custom Auth มาก่อน ให้รัน [custom-auth-migration.sql](./supabase/custom-auth-migration.sql) ก่อนตามขั้นตอนติดตั้งด้านบน

การแชร์ตำแหน่งต้องใช้ HTTPS เมื่อเปิดใช้งานจริง (localhost ใช้ HTTP ได้) และควรเปิดหน้า Dashboard ของพนักงานทิ้งไว้ระหว่างนำส่ง เพราะ browser บนอุปกรณ์มือถืออาจหยุด GPS เมื่อปิดหน้าเว็บหรือปิดแอป

## เตรียมขึ้น GitHub โดยไม่ส่ง `.env.local`

`.env.local` ถูก ignore แล้ว และ `.env.example` จะถูกเก็บขึ้น Git เพื่อเป็นตัวอย่างตัวแปรที่ต้องตั้งค่า

ตรวจสอบก่อน commit:

```powershell
git check-ignore -v .env.local
git status --short
```

โฟลเดอร์แอปปัจจุบันคือ `123app` แต่ Git repository อยู่ที่โฟลเดอร์แม่ `C:\store-app\123-app` และมีไฟล์เก่าที่ถูกลบค้างอยู่ จึงไม่ควรใช้ `git add .` หรือ push ทันที หากต้องการเก็บแอปใหม่เป็นโฟลเดอร์ย่อย ให้ stage เฉพาะ `123app` จากโฟลเดอร์แม่; หากต้องการแทนที่ไฟล์เดิมที่ root ของ repository ให้ยืนยันโครงสร้างนั้นก่อนเพื่อไม่ให้ลบงานเดิมโดยไม่ตั้งใจ
