-- 123พาณิชย์ปลีกส่ง · Supabase schema (ฐานข้อมูลเริ่มต้น)
-- หลังรันไฟล์นี้ ต้องรัน custom-auth-migration.sql ต่อเสมอ

create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('OWNER', 'ADMIN', 'EMPLOYEE', 'RETAILER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum ('PENDING', 'PACKED', 'DELIVERING', 'COMPLETED');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  shop_name text not null default 'ร้านใหม่',
  role public.app_role not null default 'RETAILER',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  price_box numeric(12, 2) not null check (price_box >= 0),
  price_pack numeric(12, 2) check (price_pack is null or price_pack >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.profiles(id) on delete restrict,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'PENDING',
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity_box integer not null default 0 check (quantity_box >= 0),
  quantity_pack integer not null default 0 check (quantity_pack >= 0),
  unit_price_box numeric(12, 2) not null check (unit_price_box >= 0),
  unit_price_pack numeric(12, 2) check (unit_price_pack is null or unit_price_pack >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  check (quantity_box > 0 or quantity_pack > 0)
);

create table if not exists public.delivery_tracking (
  order_id uuid primary key references public.orders(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

create index if not exists products_stock_idx on public.products(stock asc);
create index if not exists orders_retailer_created_idx on public.orders(retailer_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

drop trigger if exists delivery_tracking_updated_at on public.delivery_tracking;
create trigger delivery_tracking_updated_at
before update on public.delivery_tracking
for each row execute procedure public.set_updated_at();

-- ผู้สมัครใหม่เป็น RETAILER เสมอ เพื่อป้องกันการยกระดับสิทธิ์จากหน้าเว็บ
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, shop_name, role)
  values (
    new.id,
    new.phone,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'shop_name'), ''), 'ร้านใหม่'),
    'RETAILER'
  )
  on conflict (id) do update
  set phone = excluded.phone,
      shop_name = excluded.shop_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ยกระดับสิทธิ์ OWNER / ADMIN / EMPLOYEE ด้วย SQL Editor เท่านั้น ตัวอย่าง:
-- update public.profiles set role = 'OWNER' where phone = '+66812345678';
create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_tracking enable row level security;

drop policy if exists "profile self or operations read" on public.profiles;
drop policy if exists "profile self or owner employee read" on public.profiles;
create policy "profile self or owner employee read"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.get_my_role() in ('OWNER', 'EMPLOYEE')
);

drop policy if exists "authenticated product read" on public.products;
create policy "authenticated product read"
on public.products for select to authenticated
using (true);

drop policy if exists "owner product insert" on public.products;
create policy "owner product insert"
on public.products for insert to authenticated
with check (public.get_my_role() = 'OWNER');

drop policy if exists "owner product update" on public.products;
create policy "owner product update"
on public.products for update to authenticated
using (public.get_my_role() = 'OWNER')
with check (public.get_my_role() = 'OWNER');

drop policy if exists "owner product delete" on public.products;
create policy "owner product delete"
on public.products for delete to authenticated
using (public.get_my_role() = 'OWNER');

drop policy if exists "order visibility by role" on public.orders;
create policy "order visibility by role"
on public.orders for select to authenticated
using (
  retailer_id = auth.uid()
  or public.get_my_role() in ('OWNER', 'EMPLOYEE')
);

drop policy if exists "order item visibility follows order" on public.order_items;
create policy "order item visibility follows order"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and (
        orders.retailer_id = auth.uid()
        or public.get_my_role() in ('OWNER', 'EMPLOYEE')
      )
  )
);

drop policy if exists "tracking visibility follows order" on public.delivery_tracking;
create policy "tracking visibility follows order"
on public.delivery_tracking for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = delivery_tracking.order_id
      and (
        orders.retailer_id = auth.uid()
        or public.get_my_role() in ('OWNER', 'EMPLOYEE')
      )
  )
);

drop policy if exists "employee writes own tracking" on public.delivery_tracking;
create policy "employee writes own tracking"
on public.delivery_tracking for insert to authenticated
with check (
  public.get_my_role() = 'EMPLOYEE'
  and employee_id = auth.uid()
);

drop policy if exists "employee updates own tracking" on public.delivery_tracking;
create policy "employee updates own tracking"
on public.delivery_tracking for update to authenticated
using (public.get_my_role() = 'EMPLOYEE' and employee_id = auth.uid())
with check (public.get_my_role() = 'EMPLOYEE' and employee_id = auth.uid());

create or replace function public.admin_adjust_stock(p_product_id uuid, p_delta integer)
returns table(stock integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() not in ('OWNER', 'ADMIN') then
    raise exception 'ไม่มีสิทธิ์ปรับจำนวนสินค้า';
  end if;

  update public.products
  set stock = greatest(0, stock + p_delta)
  where id = p_product_id
  returning products.stock into stock;

  if not found then
    raise exception 'ไม่พบสินค้า';
  end if;

  return next;
end;
$$;

create or replace function public.create_retailer_order(p_items jsonb)
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
  if public.get_my_role() <> 'RETAILER' then
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
  values (auth.uid(), v_total)
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

create or replace function public.update_delivery_status(
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
  if public.get_my_role() <> 'EMPLOYEE' then
    raise exception 'เฉพาะพนักงานเท่านั้นที่อัปเดตสถานะจัดส่งได้';
  end if;
  if p_status not in ('PACKED', 'DELIVERING', 'COMPLETED') then
    raise exception 'ไม่สามารถใช้สถานะนี้ได้';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and (assigned_employee_id is null or assigned_employee_id = auth.uid())
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
      assigned_employee_id = auth.uid()
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ';
  end if;
  return v_order;
end;
$$;

-- RPC ต้องเรียกผ่าน anon key พร้อม JWT ของผู้ใช้เท่านั้น
revoke execute on function public.get_my_role() from public;
revoke execute on function public.admin_adjust_stock(uuid, integer) from public;
revoke execute on function public.create_retailer_order(jsonb) from public;
revoke execute on function public.update_delivery_status(uuid, public.order_status) from public;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.admin_adjust_stock(uuid, integer) to authenticated;
grant execute on function public.create_retailer_order(jsonb) to authenticated;
grant execute on function public.update_delivery_status(uuid, public.order_status) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.delivery_tracking;
exception when duplicate_object then null;
end $$;
