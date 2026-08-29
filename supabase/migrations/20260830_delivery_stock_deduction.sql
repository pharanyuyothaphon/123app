-- 123พาณิชย์ปลีกส่ง · อัปเดตการตัดสต็อกเมื่อพนักงานเริ่มนำส่ง
--
-- รันไฟล์นี้ใน Supabase SQL Editor หลังจาก custom-auth-migration.sql
-- เป็นการ replace เฉพาะ RPC ที่แอปเรียก จึงไม่แก้ไขสินค้า ออเดอร์ หรือข้อมูลผู้ใช้เดิม

begin;

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

  -- Lock the order first. This prevents concurrent clicks from deducting stock twice.
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

    -- Lock in a stable order and validate every product before deducting any stock.
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

    -- A single stock column means each requested box and pack uses one stock unit.
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

revoke all on function public.custom_update_delivery_status(uuid, uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.custom_update_delivery_status(uuid, uuid, public.order_status) to service_role;

commit;
