export type Role = "OWNER" | "ADMIN" | "EMPLOYEE" | "RETAILER";

export type OrderStatus =
  | "PENDING"
  | "PACKED"
  | "DELIVERING"
  | "COMPLETED";

export type DashboardView = "overview" | "orders" | "add-product" | "tracking" | "cart";

export interface Product {
  id: string;
  name: string;
  price_box: number;
  price_pack: number | null;
  stock: number;
  created_at?: string;
}

export interface Retailer {
  id: string;
  shop_name: string;
  phone?: string | null;
  role?: Role;
}

export interface OrderItem {
  id?: string;
  product_id: string;
  quantity_box: number;
  quantity_pack: number;
  unit_price_box: number;
  unit_price_pack: number | null;
  line_total: number;
  product?: Product | null;
}

export interface DeliveryTracking {
  order_id: string;
  employee_id?: string | null;
  latitude: number;
  longitude: number;
  updated_at: string;
  employee?: Pick<Retailer, "id" | "shop_name"> | null;
}

export interface Order {
  id: string;
  retailer_id: string;
  assigned_employee_id?: string | null;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  retailer?: Retailer | null;
  items: OrderItem[];
  tracking?: DeliveryTracking | null;
}

export interface CartLine {
  product: Product;
  boxes: number;
  packs: number;
}

export interface AppSession {
  expires_at?: number;
  user: {
    id: string;
    phone?: string | null;
  };
}

export interface DashboardSnapshot {
  products: Product[];
  orders: Order[];
  retailers: Retailer[];
  tracking: DeliveryTracking[];
}
