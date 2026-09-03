-- แก้ RPC ปรับสต็อกที่ชนกันระหว่าง output column `stock` และ products.stock
-- รันไฟล์นี้ใน Supabase SQL Editor หนึ่งครั้งสำหรับฐานข้อมูลที่ติดตั้งแล้ว

begin;

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

  -- Qualifying the table alias avoids the PL/pgSQL output variable named `stock`.
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

revoke all on function public.custom_adjust_stock(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.custom_adjust_stock(uuid, uuid, integer) to service_role;

commit;
