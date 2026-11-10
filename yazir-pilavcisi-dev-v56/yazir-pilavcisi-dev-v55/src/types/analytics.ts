/** Analiz RPC çıktıları (sql/20_courier_customer_analytics.sql) */

export interface CourierOverviewRow {
  courier_id: string;
  courier_name: string;
  phone: string | null;
  vehicle_type: string;
  plate: string | null;
  is_active: boolean;
  is_online: boolean;
  delivery_count: number;
  revenue_carried: number;
  cash_collected: number;
  avg_total_min: number | null;
  avg_delivery_min: number | null;
  avg_pickup_wait_min: number | null;
  total_delivery_min: number;
  fastest_min: number | null;
  slowest_min: number | null;
  on_time_pct: number | null;
  reassigned_count: number;
  cancelled_count: number;
  online_minutes: number;
  active_days: number;
  peak_hour: number | null;
  points_balance: number;
  bonus_amount: number;
  last_delivery_at: string | null;
}

export interface HourPoint { hour: number; count: number; avg_min?: number | null; revenue?: number }
export interface DowPoint { dow: number; count: number; avg_min?: number | null; revenue?: number }

export interface CourierDetail {
  summary: {
    delivery_count: number;
    revenue: number;
    avg_order_value: number;
    cash_collected: number;
    cash_only: number;
    card_only: number;
    avg_total_min: number | null;
    avg_delivery_min: number | null;
    avg_pickup_wait_min: number | null;
    total_delivery_min: number;
    fastest_min: number | null;
    slowest_min: number | null;
    on_time_pct: number | null;
    active_days: number;
    first_delivery_at: string | null;
    last_delivery_at: string | null;
    online_minutes: number;
    session_count: number;
    rank: number;
    ranked_couriers: number;
    reassigned_count: number;
    cancelled_count: number;
    points_balance: number;
    bonus_amount: number;
  };
  hourly: HourPoint[];
  weekday: DowPoint[];
  daily: { day: string; count: number; revenue: number; avg_min: number | null }[];
  districts: { district: string; count: number; avg_min: number | null }[];
  recent: {
    order_id: string;
    order_no: number;
    customer_name: string | null;
    district: string | null;
    address: string | null;
    total: number;
    payment_method: string | null;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string;
    delivery_min: number | null;
    total_min: number | null;
  }[];
  points: { id: number; kind: string; points: number; amount: number; note: string | null; created_at: string }[];
}

export interface CustomerOverview {
  summary: {
    total_customers: number;
    new_customers: number;
    members: number;
    active_customers: number;
    returning_customers: number;
    first_time_buyers: number;
    repeat_rate: number | null;
    order_count: number;
    guest_orders: number;
    revenue: number;
    member_revenue: number;
    avg_basket: number;
    avg_orders_per_active: number;
    avg_days_between_orders: number | null;
    avg_lifetime_value: number;
    cancelled_orders: number;
    avg_wait_min: number | null;
    points_outstanding: number;
  };
  segments: {
    vip: number; loyal: number; regular: number; one_time: number; never_ordered: number; sleeping: number; new_14d: number;
  };
  hourly: HourPoint[];
  weekday: DowPoint[];
  daily: { day: string; count: number; revenue: number; customers: number }[];
  districts: { district: string; count: number; revenue: number }[];
  payments: { method: string; count: number; revenue: number }[];
  order_types: { type: string; count: number; revenue: number }[];
  sources: { source: string; count: number; revenue: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  top_customers: { customer_id: string; name: string; phone: string | null; orders: number; spent: number }[];
}

export interface CustomerDetail {
  summary: {
    order_count: number;
    delivered_count: number;
    cancelled_count: number;
    total_spent: number;
    avg_basket: number;
    max_basket: number;
    first_order_at: string | null;
    last_order_at: string | null;
    days_since_last: number | null;
    avg_interval_days: number | null;
    avg_wait_min: number | null;
    delivery_orders: number;
    pickup_orders: number;
    dine_in_orders: number;
  };
  hourly: HourPoint[];
  weekday: DowPoint[];
  monthly: { month: string; count: number; spent: number }[];
  payments: { method: string; count: number }[];
  districts: { district: string; count: number }[];
  favorite_products: { name: string; qty: number; orders: number; spent: number }[];
  couriers: { courier_id: string; name: string; count: number }[];
}
