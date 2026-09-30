-- 123พาณิชย์ปลีกส่ง · ระบบจัดการประเภทสินค้า
-- รันหลังจาก schema.sql, custom-auth-migration.sql และ 20260906_daily_receipts_categories_checkout_stock.sql
-- ไฟล์นี้ย้ายค่า category แบบข้อความเดิมเข้าสู่ตารางประเภทสินค้า โดยไม่เปลี่ยนข้อมูลในใบเสร็จย้อนหลัง

begin;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_name_nonblank_check
    check (char_length(trim(name)) between 1 and 80),
  constraint product_categories_normalized_name_check
    check (normalized_name = lower(regexp_replace(trim(name), '\s+', ' ', 'g'))),
  constraint product_categories_normalized_name_key unique (normalized_name)
);

alter table public.product_categories
  add column if not exists is_active boolean not null default true;
alter table public.product_categories
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.product_categories
  add column if not exists created_at timestamptz not null default now();
alter table public.product_categories
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_categories_name_nonblank_check'
      and conrelid = 'public.product_categories'::regclass
  ) then
    alter table public.product_categories
      add constraint product_categories_name_nonblank_check
      check (char_length(trim(name)) between 1 and 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_categories_normalized_name_check'
      and conrelid = 'public.product_categories'::regclass
  ) then
    alter table public.product_categories
      add constraint product_categories_normalized_name_check
      check (normalized_name = lower(regexp_replace(trim(name), '\s+', ' ', 'g')));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_categories_normalized_name_key'
      and conrelid = 'public.product_categories'::regclass
  ) then
    alter table public.product_categories
      add constraint product_categories_normalized_name_key unique (normalized_name);
  end if;
end;
$$;

-- รองรับฐานข้อมูลเดิมที่มีชื่อประเภทว่างหรือมีช่องว่างเกิน
update public.products
set category = 'ทั่วไป'
where nullif(trim(category), '') is null;

-- สร้างประเภทจากสินค้าเดิม พร้อมมี “ทั่วไป” เสมอ แม้คลังยังไม่มีสินค้า
insert into public.product_categories (name, normalized_name, created_by)
select source.name, source.normalized_name, owner_profile.id
from (
  select 'ทั่วไป'::text as name, 'ทั่วไป'::text as normalized_name
  union
  select
    regexp_replace(trim(product.category), '\s+', ' ', 'g') as name,
    lower(regexp_replace(trim(product.category), '\s+', ' ', 'g')) as normalized_name
  from public.products as product
) as source
left join lateral (
  select profile.id
  from public.profiles as profile
  where profile.role = 'OWNER'
  order by profile.created_at asc
  limit 1
) as owner_profile on true
on conflict (normalized_name) do nothing;

alter table public.products add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_category_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_id_fkey
      foreign key (category_id) references public.product_categories(id) on delete restrict;
  end if;
end;
$$;

update public.products as product
set category_id = category_row.id
from public.product_categories as category_row
where product.category_id is null
  and category_row.normalized_name = lower(regexp_replace(trim(product.category), '\s+', ' ', 'g'));

-- fallback สำหรับข้อมูลที่ผิดรูปแบบซึ่งถูก normalize ไม่ได้ ให้ใช้ “ทั่วไป”
update public.products
set category_id = (
  select id from public.product_categories where normalized_name = 'ทั่วไป'
)
where category_id is null;

alter table public.products alter column category_id set not null;
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists product_categories_active_name_idx on public.product_categories(is_active desc, name asc);

drop trigger if exists product_categories_updated_at on public.product_categories;
create trigger product_categories_updated_at
before update on public.product_categories
for each row execute procedure public.set_updated_at();

alter table public.product_categories enable row level security;

drop policy if exists "authenticated product category read" on public.product_categories;
create policy "authenticated product category read"
on public.product_categories for select to authenticated
using (true);

drop policy if exists "owner product category insert" on public.product_categories;
create policy "owner product category insert"
on public.product_categories for insert to authenticated
with check (public.get_my_role() = 'OWNER');

drop policy if exists "owner product category update" on public.product_categories;
create policy "owner product category update"
on public.product_categories for update to authenticated
using (public.get_my_role() = 'OWNER')
with check (public.get_my_role() = 'OWNER');

drop policy if exists "owner product category delete" on public.product_categories;
create policy "owner product category delete"
on public.product_categories for delete to authenticated
using (public.get_my_role() = 'OWNER');

-- การเปลี่ยนชื่อและการลบต้องทำใน transaction เดียวกับการอ้างอิงสินค้า
create or replace function public.custom_manage_product_category(
  p_owner_id uuid,
  p_action text,
  p_category_id uuid default null,
  p_name text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.product_categories;
  v_name text;
  v_normalized_name text;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_owner_id and role = 'OWNER'
  ) then
    raise exception 'เฉพาะ OWNER เท่านั้นที่จัดการประเภทสินค้าได้';
  end if;

  if p_action = 'create' then
    v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
    if char_length(v_name) not between 1 and 80 then
      raise exception 'ชื่อประเภทสินค้าต้องมี 1–80 ตัวอักษร';
    end if;
    v_normalized_name := lower(v_name);

    insert into public.product_categories (name, normalized_name, created_by)
    values (v_name, v_normalized_name, p_owner_id)
    on conflict (normalized_name) do nothing
    returning * into v_category;

    if not found then
      raise exception 'มีประเภทสินค้านี้อยู่แล้ว';
    end if;

    return jsonb_build_object('category', jsonb_build_object(
      'id', v_category.id,
      'name', v_category.name,
      'normalized_name', v_category.normalized_name,
      'is_active', v_category.is_active,
      'created_at', v_category.created_at,
      'updated_at', v_category.updated_at
    ));
  end if;

  if p_category_id is null then
    raise exception 'รหัสประเภทสินค้าไม่ถูกต้อง';
  end if;

  select *
  into v_category
  from public.product_categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'ไม่พบประเภทสินค้า';
  end if;

  if p_action = 'update' then
    if v_category.normalized_name = 'ทั่วไป' and (p_name is not null or p_is_active is false) then
      raise exception 'ไม่สามารถเปลี่ยนชื่อหรือปิดใช้งานประเภทสินค้า “ทั่วไป” ได้';
    end if;

    if p_name is not null then
      v_name := regexp_replace(trim(p_name), '\s+', ' ', 'g');
      if char_length(v_name) not between 1 and 80 then
        raise exception 'ชื่อประเภทสินค้าต้องมี 1–80 ตัวอักษร';
      end if;
      v_normalized_name := lower(v_name);

      if exists (
        select 1 from public.product_categories
        where normalized_name = v_normalized_name and id <> p_category_id
      ) then
        raise exception 'มีประเภทสินค้านี้อยู่แล้ว';
      end if;

      update public.product_categories
      set name = v_name,
          normalized_name = v_normalized_name
      where id = p_category_id
      returning * into v_category;

      -- products เก็บชื่อไว้เพื่อรองรับใบเสร็จ/หน้าจอเดิม แต่ใบเสร็จย้อนหลังจะไม่ถูกแก้
      update public.products
      set category = v_category.name
      where category_id = p_category_id;
    end if;

    if p_is_active is not null then
      update public.product_categories
      set is_active = p_is_active
      where id = p_category_id
      returning * into v_category;
    end if;

    return jsonb_build_object('category', jsonb_build_object(
      'id', v_category.id,
      'name', v_category.name,
      'normalized_name', v_category.normalized_name,
      'is_active', v_category.is_active,
      'created_at', v_category.created_at,
      'updated_at', v_category.updated_at
    ));
  end if;

  if p_action = 'delete' then
    if v_category.normalized_name = 'ทั่วไป' then
      raise exception 'ไม่สามารถลบประเภทสินค้า “ทั่วไป” ได้';
    end if;
    if exists (select 1 from public.products where category_id = p_category_id) then
      raise exception 'ประเภทนี้ยังมีสินค้าใช้อยู่ กรุณาปิดใช้งานแทน';
    end if;

    delete from public.product_categories where id = p_category_id;
    return jsonb_build_object('deleted', true, 'id', p_category_id);
  end if;

  raise exception 'คำสั่งจัดการประเภทสินค้าไม่ถูกต้อง';
end;
$$;

revoke all on function public.custom_manage_product_category(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.custom_manage_product_category(uuid, text, uuid, text, boolean) to service_role;

commit;
