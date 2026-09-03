-- 123พาณิชย์ปลีกส่ง · ส่วนเพิ่มสำหรับ Custom Auth
-- รันใน Supabase Dashboard > SQL Editor เพียงครั้งเดียว
-- SQL นี้เก็บตาราง, ข้อมูล, RLS policy, trigger และ RPC เดิมไว้ทั้งหมด
-- เพิ่มเพียง app_credentials, auth_version และ Custom RPC ที่ชื่อขึ้นต้นด้วย custom_

begin;

-- จำเป็นเฉพาะ constraint นี้: RETAILER ที่สมัครแบบ Custom Auth ไม่มี auth.users
-- คำสั่งนี้ไม่เปลี่ยน id, phone, shop_name, role หรือข้อมูลแถวเดิมใน profiles
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add column if not exists auth_version integer not null default 1 check (auth_version > 0);

-- เก็บเฉพาะ scrypt hash และ salt: ไม่เก็บรหัสผ่านจริง
create table if not exists public.app_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_salt text not null check (char_length(password_salt) >= 16),
  password_hash text not null check (char_length(password_hash) >= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_credentials_updated_at on public.app_credentials;
create trigger app_credentials_updated_at
before update on public.app_credentials
for each row execute procedure public.set_updated_at();

alter table public.app_credentials enable row level security;
revoke all on table public.app_credentials from anon, authenticated;

-- สมัคร RETAILER และสร้าง credential ใน transaction เดียว
create or replace function public.custom_register_retailer(
  p_phone text,
  p_shop_name text,
  p_password_salt text,
  p_password_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := gen_random_uuid();
begin
  if nullif(trim(p_phone), '') is null then
    raise exception 'กรุณาระบุเบอร์โทรศัพท์';
  end if;
  if nullif(trim(p_shop_name), '') is null then
    raise exception 'กรุณาระบุชื่อร้านค้า';
  end if;
  if exists (select 1 from public.profiles where phone = p_phone) then
    raise exception 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว';
  end if;

  insert into public.profiles (id, phone, shop_name, role)
  values (v_profile_id, p_phone, trim(p_shop_name), 'RETAILER');

  insert into public.app_credentials (profile_id, password_salt, password_hash)
  values (v_profile_id, p_password_salt, p_password_hash);

  return v_profile_id;
end;
$$;

-- สคริปต์ผู้ดูแลใช้เปลี่ยน hash รหัสผ่านและยกเลิก session เดิมใน transaction เดียว
create or replace function public.custom_set_profile_credential(
  p_profile_id uuid,
  p_password_salt text,
  p_password_hash text,
  p_invalidate_sessions boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'ไม่พบผู้ใช้';
  end if;
  if char_length(p_password_salt) < 16 or char_length(p_password_hash) < 32 then
    raise exception 'ข้อมูลรหัสผ่านไม่ถูกต้อง';
  end if;

  insert into public.app_credentials (profile_id, password_salt, password_hash)
  values (p_profile_id, p_password_salt, p_password_hash)
  on conflict (profile_id) do update
  set password_salt = excluded.password_salt,
      password_hash = excluded.password_hash,
      updated_at = now();

  if p_invalidate_sessions then
    update public.profiles
    set auth_version = auth_version + 1
    where id = p_profile_id;
  end if;
end;
$$;

-- ปรับสต็อกแบบ atomic โดยให้ API ส่ง actor ที่ผ่านการตรวจ session แล้ว
create or replace function public.custom_adjust_stock(
  p_actor_id uuid,
  p_product_id uuid,
  p_delta integer
)
returns table(stock integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role in ('OWNER', 'ADMIN')
  ) then
    raise exception 'ไม่มีสิทธิ์ปรับจำนวนสินค้า';
  end if;

  -- `stock` is also this function's output column. Qualify product columns so
  -- PostgreSQL never treats the reference as the output variable.
  update public.products as product
  set stock = greatest(0, product.stock + p_delta)
  where product.id = p_product_id
  returning product.stock into stock;

  if not found then
    raise exception 'ไม่พบสินค้า';
  end if;

  return next;
end;
$$;

-- สร้างออเดอร์โดยยืนยันว่า profile เป็น RETAILER ก่อนทุกครั้ง
create or replace function public.custom_create_retailer_order(
  p_retailer_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_boxes integer;
  v_packs integer;
  v_price_box numeric(12, 2);
  v_price_pack numeric(12, 2);
  v_line_total numeric(12, 2);
  v_total numeric(12, 2) := 0;
begin
  if not exists (
    select 1 from public.profiles where id = p_retailer_id and role = 'RETAILER'
  ) then
    raise exception 'เฉพาะผู้ค้าปลีกเท่านั้นที่สั่งซื้อได้';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_boxes := greatest(0, coalesce((v_item ->> 'quantity_box')::integer, 0));
    v_packs := greatest(0, coalesce((v_item ->> 'quantity_pack')::integer, 0));

    select price_box, price_pack
    into v_price_box, v_price_pack
    from public.products
    where id = v_product_id;

    if not found then
      raise exception 'พบสินค้าที่ไม่มีอยู่ในระบบ';
    end if;
    if v_boxes = 0 and v_packs = 0 then
      continue;
    end if;
    if v_packs > 0 and v_price_pack is null then
      raise exception 'สินค้าบางรายการไม่มีราคาต่อแพ็ค';
    end if;

    v_total := v_total + (v_boxes * v_price_box) + (v_packs * coalesce(v_price_pack, 0));
  end loop;

  if v_total <= 0 then
    raise exception 'กรุณาระบุจำนวนสินค้าที่ถูกต้อง';
  end if;

  insert into public.orders (retailer_id, total_amount)
  values (p_retailer_id, v_total)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_boxes := greatest(0, coalesce((v_item ->> 'quantity_box')::integer, 0));
    v_packs := greatest(0, coalesce((v_item ->> 'quantity_pack')::integer, 0));
    if v_boxes = 0 and v_packs = 0 then
      continue;
    end if;

    select price_box, price_pack
    into v_price_box, v_price_pack
    from public.products
    where id = v_product_id;
    v_line_total := (v_boxes * v_price_box) + (v_packs * coalesce(v_price_pack, 0));

    insert into public.order_items (
      order_id, product_id, quantity_box, quantity_pack,
      unit_price_box, unit_price_pack, line_total
    ) values (
      v_order_id, v_product_id, v_boxes, v_packs,
      v_price_box, v_price_pack, v_line_total
    );
  end loop;

  return v_order_id;
end;
$$;

-- พนักงานเท่านั้นที่เปลี่ยนสถานะจัดส่งได้
-- เมื่อเปลี่ยนจาก PACKED เป็น DELIVERING จะตัด stock ตามจำนวนกล่อง + แพ็คในออเดอร์
-- ทุกขั้นตอนอยู่ใน transaction เดียว จึงไม่ตัดซ้ำและไม่ยอมให้ stock ติดลบ
create or replace function public.custom_update_delivery_status(
  p_employee_id uuid,
  p_order_id uuid,
  p_status public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item record;
  v_stock integer;
  v_product_name text;
begin
  if not exists (
    select 1 from public.profiles where id = p_employee_id and role = 'EMPLOYEE'
  ) then
    raise exception 'เฉพาะพนักงานเท่านั้นที่อัปเดตสถานะจัดส่งได้';
  end if;
  if p_status not in ('PACKED', 'DELIVERING', 'COMPLETED') then
    raise exception 'ไม่สามารถใช้สถานะนี้ได้';
  end if;

  -- lock ออเดอร์ก่อน เพื่อกันการกดเปลี่ยนสถานะพร้อมกันหรือพนักงานรับงานซ้ำ
  select *
  into v_order
  from public.orders
  where id = p_order_id
    and (assigned_employee_id is null or assigned_employee_id = p_employee_id)
  for update;

  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ หรือคำสั่งซื้อนี้ถูกพนักงานคนอื่นรับงานแล้ว';
  end if;

  if (v_order.status = 'PENDING' and p_status <> 'PACKED')
    or (v_order.status = 'PACKED' and p_status <> 'DELIVERING')
    or (v_order.status = 'DELIVERING' and p_status <> 'COMPLETED')
  then
    raise exception 'ไม่สามารถเปลี่ยนสถานะข้ามขั้น หรือทำรายการเดิมซ้ำได้';
  end if;

  if p_status = 'DELIVERING' then
    if not exists (select 1 from public.order_items where order_id = p_order_id) then
      raise exception 'ไม่พบรายการสินค้าในคำสั่งซื้อนี้';
    end if;
    if exists (select 1 from public.order_items where order_id = p_order_id and product_id is null) then
      raise exception 'พบสินค้าที่ถูกลบออกจากคลัง จึงไม่สามารถเริ่มนำส่งได้';
    end if;

    -- lock สินค้าทีละรายการตามลำดับเดียวกัน แล้วตรวจจำนวนก่อนตัดจริง
    for v_item in
      select oi.product_id, sum(oi.quantity_box + oi.quantity_pack)::integer as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.product_id
      order by oi.product_id
    loop
      select stock, name
      into v_stock, v_product_name
      from public.products
      where id = v_item.product_id
      for update;

      if not found then
        raise exception 'พบสินค้าที่ไม่มีอยู่ในระบบ';
      end if;
      if v_stock < v_item.quantity then
        raise exception 'สินค้า "%" คงเหลือไม่เพียงพอ (เหลือ %, ต้องใช้ %)', v_product_name, v_stock, v_item.quantity;
      end if;
    end loop;

    -- stock มีคอลัมน์เดียว จึงนับกล่องและแพ็คเป็นหน่วยสต็อกที่สั่งออกอย่างละ 1 หน่วย
    update public.products as product
    set stock = product.stock - requested.quantity
    from (
      select oi.product_id, sum(oi.quantity_box + oi.quantity_pack)::integer as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.product_id
    ) as requested
    where product.id = requested.product_id;
  end if;

  update public.orders
  set status = p_status,
      assigned_employee_id = p_employee_id
  where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

-- บันทึกพิกัดพนักงานโดยไม่เปิดสิทธิ์ตรงจาก browser ไปยัง Supabase
create or replace function public.custom_save_delivery_tracking(
  p_employee_id uuid,
  p_order_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns public.delivery_tracking
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking public.delivery_tracking;
begin
  if not exists (
    select 1 from public.profiles where id = p_employee_id and role = 'EMPLOYEE'
  ) then
    raise exception 'เฉพาะพนักงานเท่านั้นที่ส่งพิกัดได้';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'พิกัดไม่ถูกต้อง';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and assigned_employee_id = p_employee_id
      and status = 'DELIVERING'
  ) then
    raise exception 'พนักงานสามารถแชร์พิกัดได้เฉพาะงานที่ตนกำลังนำส่ง';
  end if;

  insert into public.delivery_tracking (order_id, employee_id, latitude, longitude)
  values (p_order_id, p_employee_id, p_latitude, p_longitude)
  on conflict (order_id) do update
  set employee_id = excluded.employee_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now()
  returning * into v_tracking;

  return v_tracking;
end;
$$;

revoke all on function public.custom_register_retailer(text, text, text, text) from public, anon, authenticated;
revoke all on function public.custom_set_profile_credential(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.custom_adjust_stock(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.custom_create_retailer_order(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.custom_update_delivery_status(uuid, uuid, public.order_status) from public, anon, authenticated;
revoke all on function public.custom_save_delivery_tracking(uuid, uuid, double precision, double precision) from public, anon, authenticated;

grant execute on function public.custom_register_retailer(text, text, text, text) to service_role;
grant execute on function public.custom_set_profile_credential(uuid, text, text, boolean) to service_role;
grant execute on function public.custom_adjust_stock(uuid, uuid, integer) to service_role;
grant execute on function public.custom_create_retailer_order(uuid, jsonb) to service_role;
grant execute on function public.custom_update_delivery_status(uuid, uuid, public.order_status) to service_role;
grant execute on function public.custom_save_delivery_tracking(uuid, uuid, double precision, double precision) to service_role;

commit;
