export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'owner' | 'sub_admin' | 'operator' | 'courier' | 'customer';
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'assigned' | 'on_the_way' | 'delivered' | 'cancelled';
export type OrderType = 'delivery' | 'dine_in' | 'pickup';
export type PaymentMethod = 'cash_on_delivery' | 'card_on_delivery' | 'iban' | 'platform_online' | 'cash_at_table' | 'card_at_table';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';
export type TableStatus = 'empty' | 'awaiting_order' | 'preparing' | 'served' | 'awaiting_bill' | 'bill_closed' | 'awaiting_cleaning' | 'cleaning';
export type FeedbackType = 'suggestion' | 'complaint' | 'thanks' | 'question';
export type BulkStatus = 'new' | 'contacted' | 'confirmed' | 'done' | 'cancelled';
export type OrderIssueType = 'cancelled' | 'missing_item' | 'extra_item' | 'wrong_item' | 'wrong_amount' | 'late' | 'other';
export type NotificationType = 'new_order' | 'order_assigned' | 'order_status' | 'order_cancelled' | 'bulk_request' | 'feedback' | 'system';

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettings {
  id: number;
  name: string;
  slogan: string | null;
  phone: string | null;
  whatsapp: string | null;
  wa_widget_enabled?: boolean;
  wa_catalog_url?: string | null;
  wa_quick_messages?: string[] | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  iban: string | null;
  iban_holder: string | null;
  site_url: string | null;
  instagram_url: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;
  last_google_reviews_sync: string | null;
  is_accepting_orders: boolean;
  enforce_opening_hours: boolean;
  min_order_amount: number;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  estimated_delivery_min: number;
  estimated_delivery_max: number;
  bulk_order_min_people: number;
  location_history_interval_seconds: number;
  location_history_retention_days: number;
  updated_at: string;
  updated_by: string | null;
}

export interface OpeningHour {
  day_of_week: number;
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
  is_closed: boolean;
}

/** Belirli bir tarihe özel çalışma saati (haftalık programı o gün için geçersiz kılar) */
export interface OpeningHourOverride {
  override_date: string; // YYYY-MM-DD
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
  is_closed: boolean;
  note: string | null;
  created_at?: string;
  updated_by?: string | null;
}

export interface OrderSource {
  code: string;
  label: string;
  color: string;
  is_platform: boolean;
  commission_rate: number;
  is_active: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string;
  emoji: string | null;
  image_path: string | null;
  kcal: number;
  protein_g: number;
  carb_g: number;
  is_daily: boolean;
  is_active: boolean;
  is_sold_out: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** 16_menu_extras_backup_audit.sql ile eklenen alanlar */
  allergens?: string[] | null;
  badges?: string[] | null;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  title: string;
  full_address: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiningTable {
  id: string;
  number: number;
  name: string | null;
  capacity: number;
  status: TableStatus;
  status_changed_at: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: 'square' | 'round' | 'rect';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TableQrCode {
  id: string;
  table_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface TableSession {
  id: string;
  table_id: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  total: number | null;
  payment_method: PaymentMethod | null;
  note: string | null;
}

export interface Order {
  id: string;
  order_no: number;
  source: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  address_description: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  table_id: string | null;
  table_session_id: string | null;
  courier_id: string | null;
  external_ref: string | null;
  external_payload: Json | null;
  pin_code?: string | null;
  order_code?: string | null;
  call_center_phone?: string | null;
  platform_app?: string | null;
  platform_status?: string | null;
  created_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  note: string | null;
  created_at: string;
}

export interface OrderStatusHistory {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface OrderIssue {
  id: string;
  order_id: string;
  issue_type: OrderIssueType;
  description: string | null;
  reported_by: string | null;
  created_at: string;
}

export interface CourierProfile {
  user_id: string;
  vehicle_type: string;
  plate: string | null;
  notes: string | null;
  is_online: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourierLocation {
  courier_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  updated_at: string;
}

export interface CourierDelivery {
  id: string;
  order_id: string;
  courier_id: string;
  assigned_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  ended_at: string | null;
  outcome: 'delivered' | 'reassigned' | 'unassigned' | 'cancelled' | null;
  total_seconds: number | null;
  delivery_seconds: number | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Json;
  is_read: boolean;
  created_at: string;
}

export interface Feedback {
  id: string;
  name: string;
  contact: string | null;
  type: FeedbackType;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface BulkOrderRequest {
  id: string;
  full_name: string;
  phone: string;
  event_type: string;
  people_count: number;
  delivery_at: string;
  delivery_address: string;
  note: string | null;
  status: BulkStatus;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteReview {
  id: string;
  author: string;
  rating: number;
  body: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  source: 'manual' | 'google';
  google_review_id: string | null;
  google_place_id: string | null;
  review_time: string | null;
  profile_photo_url: string | null;
  relative_time_description: string | null;
  language: string | null;
}

export interface RestaurantGallery {
  id: string;
  title: string;
  image_path: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  /** 14_menu_gallery_pro.sql ile eklenen alanlar (eski kayıtlarda boş olabilir) */
  description?: string | null;
  category?: string | null;
  is_featured?: boolean | null;
  updated_at?: string | null;
}

export interface CourierLive {
  courier_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  is_online: boolean;
  vehicle_type: string;
  plate: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  battery: number | null;
  location_updated_at: string | null;
  active_order_count: number;
}

export interface Permission {
  key: string;
  label: string;
  group_name: string;
  sort_order: number;
}

export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}
export interface ProductOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_active: boolean;
  sort_order: number;
}

export interface ProductOptionGroup {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  options?: ProductOption[];
}
