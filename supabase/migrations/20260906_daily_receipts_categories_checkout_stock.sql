-- 123พาณิชย์ปลีกส่ง · ประเภทสินค้า, ใบเสร็จรายวัน และตัดสต๊อกตอนยืนยันสั่งซื้อ
-- รันหลังจาก schema.sql และ custom-auth-migration.sql
--
-- โมเดลข้อมูล:
--   * orders / order_items = งานจัดส่งแต่ละครั้งสำหรับพนักงาน
--   * daily_receipts / receipt_items = ใบเสร็จรวมของร้านหนึ่งแห่งต่อหนึ่งวัน (เวลา Asia/Bangkok)

begin;

-- ประเภทสินค้าใช้ทั้งการเพิ่มสินค้าและการกรองของผู้ค้าปลีก
alter table public.products add column if not exists category text;
update public.products
set category = 'ทั่วไป'
where nullif(trim(category), '') is null;
alter table public.products alter column category set default 'ทั่วไป';
alter table public.products alter column category set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_category_nonblank_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_nonblank_check
      check (char_length(trim(category)) between 1 and 80);
  end if;
end;
$$;

create index if not exists products_category_idx on public.products(category);

-- เก็บชื่อสินค้าไว้กับรายการจัดส่ง เพื่อให้ประวัติยังอ่านได้หลังลบสินค้าจากคลัง
alter table public.order_items add column if not exists product_name text;
update public.order_items as item
set product_name = coalesce(product.name, 'สินค้าที่ลบออกจากคลัง')
from public.products as product
where item.product_name is null
  and product.id = item.product_id;
update public.order_items
set product_name = 'สินค้าที่ลบออกจากคลัง'
where product_name is null or trim(product_name) = '';
alter table public.order_items alter column product_name set default 'สินค้าที่ลบออกจากคลัง';
alter table public.order_items alter column product_name set not null;

-- ใบเสร็จหนึ่งฉบับต่อร้านต่อวัน โดยกำหนดวันตามเวลาไทยบนเซิร์ฟเวอร์
create table if not exists public.daily_receipts (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.profiles(id) on delete restrict,
  receipt_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, receipt_date)
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.daily_receipts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  category text not null default 'ทั่วไป',
  quantity_box integer not null default 0 check (quantity_box >= 0),
  quantity_pack integer not null default 0 check (quantity_pack >= 0),
  unit_price_box numeric(12, 2) not null check (unit_price_box >= 0),
  unit_price_pack numeric(12, 2) check (unit_price_pack is null or unit_price_pack >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  check (quantity_box > 0 or quantity_pack > 0)
);

alter table public.orders
  add column if not exists receipt_id uuid references public.daily_receipts(id) on delete restrict;
alter table public.orders
  add column if not exists stock_deducted_at timestamptz;
alter table public.orders
  add column if not exists checkout_request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_retailer_checkout_request_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_retailer_checkout_request_key unique (retailer_id, checkout_request_id);
  end if;
end;
$$;

create index if not exists daily_receipts_retailer_date_idx on public.daily_receipts(retailer_id, receipt_date desc);
create index if not exists receipt_items_receipt_idx on public.receipt_items(receipt_id);
create index if not exists orders_receipt_idx on public.orders(receipt_id);

drop trigger if exists daily_receipts_updated_at on public.daily_receipts;
create trigger daily_receipts_updated_at
before update on public.daily_receipts
for each row execute procedure public.set_updated_at();

-- สร้างใบเสร็จย้อนหลังจากออเดอร์เดิมโดยไม่แก้ไขรายการจัดส่งเดิม
insert into public.daily_receipts (retailer_id, receipt_date, total_amount, created_at, updated_at)
select
  order_row.retailer_id,
  (order_row.created_at at time zone 'Asia/Bangkok')::date,
  sum(order_row.total_amount),
  min(order_row.created_at),
  max(order_row.updated_at)
from public.orders as order_row
group by order_row.retailer_id, (order_row.created_at at time zone 'Asia/Bangkok')::date
on conflict (retailer_id, receipt_date) do nothing;

update public.orders as order_row
set receipt_id = receipt.id
from public.daily_receipts as receipt
where order_row.receipt_id is null
  and receipt.retailer_id = order_row.retailer_id
  and receipt.receipt_date = (order_row.created_at at time zone 'Asia/Bangkok')::date;

-- เติมบรรทัดใบเสร็จย้อนหลังเฉพาะใบที่ยังไม่มีบรรทัด เพื่อให้ migration รันซ้ำได้อย่างปลอดภัย
insert into public.receipt_items (
  receipt_id, product_id, product_name, category,
  quantity_box, quantity_pack, unit_price_box, unit_price_pack, line_total
)
select
  grouped.receipt_id,
  grouped.product_id,
  grouped.product_name,
  grouped.category,
  grouped.quantity_box,
  grouped.quantity_pack,
  grouped.unit_price_box,
  grouped.unit_price_pack,
  grouped.line_total
from (
  select
    order_row.receipt_id,
    item.product_id,
    coalesce(nullif(max(item.product_name), ''), 'สินค้าที่ลบออกจากคลัง') as product_name,
    coalesce(nullif(max(product.category), ''), 'ทั่วไป') as category,
    sum(item.quantity_box)::integer as quantity_box,
    sum(item.quantity_pack)::integer as quantity_pack,
    item.unit_price_box,
    item.unit_price_pack,
    sum(item.line_total) as line_total
  from public.orders as order_row
  join public.order_items as item on item.order_id = order_row.id
  left join public.products as product on product.id = item.product_id
  where order_row.receipt_id is not null
  group by order_row.receipt_id, item.product_id, item.product_name, item.unit_price_box, item.unit_price_pack
) as grouped
where not exists (
  select 1 from public.receipt_items as existing
  where existing.receipt_id = grouped.receipt_id
);

-- ออเดอร์เก่าที่เริ่มนำส่งไปแล้วเคยถูกตัดสต๊อกตามระบบเดิม จึงทำเครื่องหมายไว้
-- ส่วน PENDING/PACKED เดิมจะถูกตัดเพียงครั้งเดียวเมื่อพนักงานเริ่มนำส่ง เพื่อไม่ให้ข้ามการตัดสต๊อกระหว่างเปลี่ยนระบบ
update public.orders
set stock_deducted_at = coalesce(stock_deducted_at, updated_at)
where status in ('DELIVERING', 'COMPLETED')
  and stock_deducted_at is null;

alter table public.daily_receipts enable row level security;
alter table public.receipt_items enable row level security;

drop policy if exists "daily receipt visibility by role" on public.daily_receipts;
create policy "daily receipt visibility by role"
on public.daily_receipts for select to authenticated
using (
  retailer_id = auth.uid()
  or public.get_my_role() = 'OWNER'
);

drop policy if exists "receipt item visibility follows receipt" on public.receipt_items;
create policy "receipt item visibility follows receipt"
on public.receipt_items for select to authenticated
using (
  exists (
    select 1 from public.daily_receipts as receipt
    where receipt.id = receipt_items.receipt_id
      and (receipt.retailer_id = auth.uid() or public.get_my_role() = 'OWNER')
  )
);

-- คืนค่าเป็น JSON เพื่อส่งทั้งงานจัดส่งที่เพิ่งสร้างและใบเสร็จรายวันกลับไปยัง UI
drop function if exists public.custom_create_retailer_order(uuid, jsonb);
drop function if exists public.custom_create_retailer_order(uuid, jsonb, uuid);
create function public.custom_create_retailer_order(
  p_retailer_id uuid,
  p_items jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_order_id uuid;
  v_existing_receipt_id uuid;
  v_receipt_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_item record;
  v_product_name text;
  v_category text;
  v_price_box numeric(12, 2);
  v_price_pack numeric(12, 2);
  v_stock integer;
  v_line_total numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_existing_receipt_item_id uuid;
begin
  if not exists (
    select 1 from public.profiles where id = p_retailer_id and role = 'RETAILER'
  ) then
    raise exception 'เฉพาะผู้ค้าปลีกเท่านั้นที่สั่งซื้อได้';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ';
  end if;
  if p_request_id is null then
    raise exception 'รหัสยืนยันคำสั่งซื้อไม่ถูกต้อง';
  end if;

  -- ป้องกัน retry รหัสเดิมที่คร่อมเที่ยงคืน: ต้องรอคำขอเดิมจบก่อนจึงตรวจผลลัพธ์
  perform pg_advisory_xact_lock(hashtext(p_retailer_id::text), hashtext(p_request_id::text));

  -- Retry ด้วย request เดิมจะได้ผลลัพธ์เดิมโดยไม่ตัดสต๊อกหรือเพิ่มยอดซ้ำ
  select order_row.id, order_row.receipt_id
  into v_order_id, v_existing_receipt_id
  from public.orders as order_row
  where order_row.retailer_id = p_retailer_id
    and order_row.checkout_request_id = p_request_id;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'receipt_id', v_existing_receipt_id);
  end if;

  -- UNIQUE(retailer_id, receipt_date) ทำให้ร้านหนึ่งมีใบเสร็จเดียวต่อวัน และ DO UPDATE ล็อกแถวไว้ทั้ง transaction
  insert into public.daily_receipts (retailer_id, receipt_date, total_amount)
  values (p_retailer_id, v_receipt_date, 0)
  on conflict (retailer_id, receipt_date) do update
  set updated_at = now()
  returning id into v_receipt_id;

  -- อีกคำขอเดียวกันอาจเริ่มพร้อมกันและรอ receipt lock อยู่ จึงตรวจซ้ำหลังได้ lock
  select order_row.id, order_row.receipt_id
  into v_order_id, v_existing_receipt_id
  from public.orders as order_row
  where order_row.retailer_id = p_retailer_id
    and order_row.checkout_request_id = p_request_id;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'receipt_id', v_existing_receipt_id);
  end if;

  -- รวมสินค้าที่ซ้ำใน payload ก่อน จากนั้นล็อกตาม product_id เพื่อป้องกันสต๊อกติดลบระหว่างหลายร้านสั่งพร้อมกัน
  for v_item in
    select
      (entry.value ->> 'product_id')::uuid as product_id,
      sum(greatest(0, coalesce(nullif(entry.value ->> 'quantity_box', '')::integer, 0)))::integer as quantity_box,
      sum(greatest(0, coalesce(nullif(entry.value ->> 'quantity_pack', '')::integer, 0)))::integer as quantity_pack
    from jsonb_array_elements(p_items) as entry(value)
    group by (entry.value ->> 'product_id')::uuid
    order by (entry.value ->> 'product_id')::uuid
  loop
    if v_item.quantity_box = 0 and v_item.quantity_pack = 0 then
      continue;
    end if;

    select product.name, product.category, product.price_box, product.price_pack, product.stock
    into v_product_name, v_category, v_price_box, v_price_pack, v_stock
    from public.products as product
    where product.id = v_item.product_id
    for update;

    if not found then
      raise exception 'พบสินค้าที่ไม่มีอยู่ในระบบ';
    end if;
    if v_item.quantity_pack > 0 and v_price_pack is null then
      raise exception 'สินค้าบางรายการไม่มีราคาต่อแพ็ค';
    end if;
    if v_stock < v_item.quantity_box + v_item.quantity_pack then
      raise exception 'สินค้า "%" คงเหลือไม่เพียงพอ (เหลือ %, ต้องใช้ %)', v_product_name, v_stock, v_item.quantity_box + v_item.quantity_pack;
    end if;

    v_total := v_total + (v_item.quantity_box * v_price_box) + (v_item.quantity_pack * coalesce(v_price_pack, 0));
  end loop;

  if v_total <= 0 then
    raise exception 'กรุณาระบุจำนวนสินค้าที่ถูกต้อง';
  end if;

  -- สร้างงานจัดส่งของการยืนยันครั้งนี้ โดยเชื่อมกับใบเสร็จที่รวมยอดทั้งวัน
  insert into public.orders (retailer_id, receipt_id, total_amount, stock_deducted_at, checkout_request_id)
  values (p_retailer_id, v_receipt_id, v_total, now(), p_request_id)
  returning id into v_order_id;

  for v_item in
    select
      (entry.value ->> 'product_id')::uuid as product_id,
      sum(greatest(0, coalesce(nullif(entry.value ->> 'quantity_box', '')::integer, 0)))::integer as quantity_box,
      sum(greatest(0, coalesce(nullif(entry.value ->> 'quantity_pack', '')::integer, 0)))::integer as quantity_pack
    from jsonb_array_elements(p_items) as entry(value)
    group by (entry.value ->> 'product_id')::uuid
    order by (entry.value ->> 'product_id')::uuid
  loop
    if v_item.quantity_box = 0 and v_item.quantity_pack = 0 then
      continue;
    end if;

    select product.name, product.category, product.price_box, product.price_pack
    into v_product_name, v_category, v_price_box, v_price_pack
    from public.products as product
    where product.id = v_item.product_id;

    v_line_total := (v_item.quantity_box * v_price_box) + (v_item.quantity_pack * coalesce(v_price_pack, 0));

    insert into public.order_items (
      order_id, product_id, product_name, quantity_box, quantity_pack,
      unit_price_box, unit_price_pack, line_total
    ) values (
      v_order_id, v_item.product_id, v_product_name, v_item.quantity_box, v_item.quantity_pack,
      v_price_box, v_price_pack, v_line_total
    );

    -- แยกราคาที่ไม่เท่ากันเป็นคนละบรรทัด เพื่อให้ใบเสร็จย้อนหลังไม่บิดเบือนเมื่อเจ้าของร้านเปลี่ยนราคา
    select receipt_item.id
    into v_existing_receipt_item_id
    from public.receipt_items as receipt_item
    where receipt_item.receipt_id = v_receipt_id
      and receipt_item.product_id = v_item.product_id
      and receipt_item.unit_price_box = v_price_box
      and receipt_item.unit_price_pack is not distinct from v_price_pack
    order by receipt_item.id
    limit 1
    for update;

    if found then
      update public.receipt_items
      set quantity_box = quantity_box + v_item.quantity_box,
          quantity_pack = quantity_pack + v_item.quantity_pack,
          line_total = line_total + v_line_total
      where id = v_existing_receipt_item_id;
    else
      insert into public.receipt_items (
        receipt_id, product_id, product_name, category, quantity_box, quantity_pack,
        unit_price_box, unit_price_pack, line_total
      ) values (
        v_receipt_id, v_item.product_id, v_product_name, v_category, v_item.quantity_box, v_item.quantity_pack,
        v_price_box, v_price_pack, v_line_total
      );
    end if;

    -- ตัดสต๊อกทันทีเมื่อผู้ค้าปลีกยืนยัน โดยสินค้าแถวนี้ถูกล็อกไว้แล้วจากรอบตรวจสอบด้านบน
    update public.products as product
    set stock = product.stock - (v_item.quantity_box + v_item.quantity_pack)
    where product.id = v_item.product_id;
  end loop;

  update public.daily_receipts
  set total_amount = total_amount + v_total
  where id = v_receipt_id;

  return jsonb_build_object('order_id', v_order_id, 'receipt_id', v_receipt_id);
end;
$$;

-- พนักงานเปลี่ยนสถานะจัดส่งอย่างเดียว; block ตัดสต๊อกนี้มีไว้เฉพาะออเดอร์เก่าที่ยังไม่ถูกตัดก่อน migration
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

  -- Compatibility only: orders created before this migration had no checkout-time stock deduction.
  if p_status = 'DELIVERING' and v_order.stock_deducted_at is null then
    for v_item in
      select oi.product_id, sum(oi.quantity_box + oi.quantity_pack)::integer as quantity
      from public.order_items as oi
      where oi.order_id = p_order_id
      group by oi.product_id
      order by oi.product_id
    loop
      select product.stock, product.name
      into v_stock, v_product_name
      from public.products as product
      where product.id = v_item.product_id
      for update;

      if not found then
        raise exception 'พบสินค้าที่ไม่มีอยู่ในระบบ';
      end if;
      if v_stock < v_item.quantity then
        raise exception 'สินค้า "%" คงเหลือไม่เพียงพอ (เหลือ %, ต้องใช้ %)', v_product_name, v_stock, v_item.quantity;
      end if;
    end loop;

    update public.products as product
    set stock = product.stock - requested.quantity
    from (
      select oi.product_id, sum(oi.quantity_box + oi.quantity_pack)::integer as quantity
      from public.order_items as oi
      where oi.order_id = p_order_id
      group by oi.product_id
    ) as requested
    where product.id = requested.product_id;
  end if;

  update public.orders
  set status = p_status,
      assigned_employee_id = p_employee_id,
      stock_deducted_at = case
        when p_status = 'DELIVERING' and v_order.stock_deducted_at is null then now()
        else stock_deducted_at
      end
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- แอปใช้ Custom Auth ผ่าน custom_* RPC เท่านั้น จึงปิด RPC เดิมเพื่อไม่ให้ข้ามการออกใบเสร็จ/ตัดสต๊อกแบบใหม่
revoke all on function public.create_retailer_order(jsonb) from public, anon, authenticated;
revoke all on function public.update_delivery_status(uuid, public.order_status) from public, anon, authenticated;
revoke all on function public.custom_create_retailer_order(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.custom_update_delivery_status(uuid, uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.custom_create_retailer_order(uuid, jsonb, uuid) to service_role;
grant execute on function public.custom_update_delivery_status(uuid, uuid, public.order_status) to service_role;

commit;
