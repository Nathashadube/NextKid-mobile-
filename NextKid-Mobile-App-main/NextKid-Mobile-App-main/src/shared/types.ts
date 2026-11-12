// Shared domain types — used by both apps/web and apps/mobile

export interface User {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  // RULE: users must be 18+ before transacting (buying or selling)
  isAgeVerified: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'buyer' | 'seller' | 'browse_only';
  is_age_verified: boolean;
  date_of_birth?: string;
  // Schools this user's children attend (supports multiple children)
  school_ids: string[];
  child_grade?: number;
}

export interface School {
  id: string;
  name: string;
  province: SaProvince;
  city: string;
  city_name?: string;  // denormalized — present on DB rows, matches city for display
  type: 'primary' | 'high' | 'combined';
}

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  // RULE: Stitch processes ZAR natively — no currency conversion needed
  // RULE: stored in cents (multiply by 100 on save, divide by 100 on display)
  price: number;
  category: ListingCategory;
  subcategory: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  images: string[];

  // School-specific fields
  // RULE: school_id = null means the listing is nationwide/generic
  school_id: string | null;
  is_school_specific: boolean;

  // Item attribute fields
  size?: string | null;
  gender?: 'boys' | 'girls' | 'unisex' | null;
  grade?: number | null;
  sport?: string | null;

  created_at: string;
}

// RULE: Order must only move forward through these states — never skip or reverse
// PENDING_PAYMENT → PAYMENT_HELD → PENDING_SHIPMENT → SHIPPED → DELIVERED
//                                                               → DISPUTED → RESOLVED_REFUND
//                                                                           → RESOLVED_RELEASED
//                                  → AUTO_CANCELLED (seller did not ship within 3 business days)
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_HELD'
  | 'PENDING_SHIPMENT'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'DISPUTED'
  | 'RESOLVED_REFUND'
  | 'RESOLVED_RELEASED'
  | 'AUTO_CANCELLED';

export interface Order {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  // RULE: stored in cents — Stitch ZAR amount format
  amountZarCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  // RULE: order history is append-only — never delete or mutate these records
  createdAt: string;
  note?: string;
}

export type ListingCategory =
  | 'School Uniforms'
  | 'School Sports Kit'
  | 'Shoes'
  | 'Sports Equipment'
  | 'Books & Stationery'
  | 'University Textbooks'
  | 'Bags & Accessories'
  | 'Other';

export type SaProvince =
  | 'Gauteng'
  | 'Western Cape'
  | 'KwaZulu-Natal'
  | 'Eastern Cape'
  | 'Free State'
  | 'Limpopo'
  | 'Mpumalanga'
  | 'North West'
  | 'Northern Cape';