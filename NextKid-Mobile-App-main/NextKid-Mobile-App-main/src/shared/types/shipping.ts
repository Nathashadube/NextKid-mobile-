// packages/shared/types/shipping.ts

/**
 * Shipping Types for The Courier Guy Integration
 * API Docs: https://api-pudo.co.za
 * 
 * RULE: Buyer pays shipping cost. Seller only sees their item price.
 * RULE: Quote at checkout, book after payment is held in escrow.
 * RULE: Lock the quoted price at purchase - never recalculate.
 */

import type { UserLocation } from './location';

// ============================================
// TCG ADDRESS FORMATS
// ============================================

/**
 * Address format required by The Courier Guy API
 */
export interface TCGAddress {
  lat: number;
  lng: number;
  street_address: string;
  local_area: string;           // Suburb/neighborhood
  suburb?: string;
  city: string;
  code: string;                 // Postal code
  zone: string;                 // Province code (GP, WC, etc.)
  country: 'South Africa';
  entered_address: string;      // Full address string
  type: 'residential' | 'business';
  company?: string;             // Business name if applicable
}

/**
 * Locker address - just needs terminal ID
 */
export interface TCGLockerAddress {
  terminal_id: string;          // e.g., "CG54"
}

// ============================================
// TCG PARCEL
// ============================================

export interface TCGParcel {
  submitted_length_cm: string;
  submitted_width_cm: string;
  submitted_height_cm: string;
  submitted_weight_kg: string;
  parcel_description: string;
  alternative_tracking_reference?: string;
}

/**
 * Parcel dimensions stored with listing
 */
export interface ParcelDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
}

// ============================================
// TCG LOCKER SIZES
// ============================================

export const LOCKER_SIZES = {
  'V4-XS': { width: 17, height: 8, length: 60, maxWeight: 2 },
  'V4-S':  { width: 41, height: 8, length: 60, maxWeight: 5 },
  'V4-M':  { width: 41, height: 19, length: 60, maxWeight: 10 },
  'V4-L':  { width: 41, height: 41, length: 60, maxWeight: 15 },
  'V4-XL': { width: 41, height: 69, length: 60, maxWeight: 20 },
} as const;

export type LockerSize = keyof typeof LOCKER_SIZES;

export interface TCGLocker {
  code: string;                 // e.g., "CG54"
  name: string;                 // e.g., "Sasol Rivonia Uplifted"
  latitude: string;
  longitude: string;
  address: string;
  openinghours: Array<{
    day: string;
    open_time: string;
    close_time: string;
  }>;
  lstTypesBoxes: Array<{
    id: number;
    name: LockerSize;
    type: string;
    width: number;
    height: number;
    length: number;
    weight: number;
  }>;
}

// ============================================
// SHIPPING METHOD TYPES
// ============================================

/**
 * Shipping method codes
 * D2D = Door to Door (pickup from address, deliver to address)
 * D2L = Door to Locker (pickup from address, deliver to locker)
 * L2D = Locker to Door (seller drops at locker, deliver to address)
 * L2L = Locker to Locker (seller drops at locker, buyer collects from locker)
 */
export type ShippingMethod = 'D2D' | 'D2L' | 'L2D' | 'L2L';

/**
 * What the seller can offer
 */
export type SellerShippingOption = 'PICKUP' | 'PUDO_DROPOFF' | 'SCHOOL_DROPOFF';

// ============================================
// SELLER SHIPPING PROFILE
// ============================================

/**
 * Configured when seller creates account.
 * Defines how seller will ship items.
 */
export interface SellerShippingProfile {
  sellerId: string;
  
  // RULE: At least one must be true
  allowPickupFromAddress: boolean;
  pickupAddress?: UserLocation;
  
  allowPudoDropoff: boolean;
  preferredPudoLockerId?: string;   // TCG locker code e.g., "CG54"
  preferredPudoLockerName?: string; // e.g., "Sasol Rivonia Uplifted"
  preferredPudoLockerAddress?: string;
  
  // Default handling
  defaultParcelHandling: 'FRAGILE' | 'STANDARD';
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// LISTING SHIPPING CONFIG
// ============================================

/**
 * Shipping configuration per listing.
 * Seller specifies parcel size and confirms shipping methods.
 */
export interface ListingShippingConfig {
  listingId: string;
  
  // RULE: Parcel dimensions REQUIRED before listing goes live
  parcel: ParcelDimensions;
  
  // Which methods seller will use for THIS listing
  // Inherited from SellerShippingProfile, can be narrowed per listing
  shippingMethods: SellerShippingOption[];
  
  // If PUDO_DROPOFF, which locker (defaults to profile preference)
  pudoLockerId?: string;
  pudoLockerName?: string;
}

// ============================================
// SHIPPING QUOTE (From TCG API)
// ============================================

/**
 * Rate quote from The Courier Guy
 */
export interface ShippingQuote {
  // Internal tracking
  quoteId: string;              // Our generated ID
  
  // Shipping type
  method: ShippingMethod;
  serviceLevelCode: string;     // e.g., "OVN", "ECO", "D2LXS - ECO"
  serviceLevelName: string;     // e.g., "Overnight", "Economy"
  
  // Pricing (all in ZAR)
  rate: number;                 // Total cost inc VAT
  rateExcludingVat: number;
  vatAmount: number;
  
  // Timing
  estimatedCollectionDate: Date;
  estimatedDeliveryFrom: Date;
  estimatedDeliveryTo: Date;
  
  // For locker options
  collectionLockerCode?: string;
  collectionLockerName?: string;
  collectionLockerAddress?: string;
  
  deliveryLockerCode?: string;
  deliveryLockerName?: string;
  deliveryLockerAddress?: string;
  
  // Raw TCG response (for debugging/auditing)
  rawResponse?: TCGRateOption;
}

// ============================================
// TCG API RESPONSE TYPES
// ============================================

/**
 * A single rate option returned by the TCG /rates endpoint.
 * Used to type API responses strictly (no `any`).
 */
export interface TCGRateOption {
  service_level_code: string;
  service_level: string;
  rate: number;               // ZAR inc VAT (float)
  rate_excluding_vat: number;
  vat_amount: number;
  collection_date: string;    // ISO date string
  delivery_date_from: string; // ISO date string
  delivery_date_to: string;   // ISO date string
}

// ============================================
// CHECKOUT SHIPPING
// ============================================

/**
 * Shipping state during checkout
 */
export interface CheckoutShipping {
  // Available options (sorted by price, cheapest first)
  availableQuotes: ShippingQuote[];
  
  // Buyer's selection
  selectedQuote?: ShippingQuote;
  
  // Origin (seller's location or locker)
  sellerOrigin: {
    type: 'ADDRESS' | 'LOCKER';
    address?: UserLocation;
    lockerId?: string;
    lockerName?: string;
    lockerAddress?: string;
  };
  
  // Destination (buyer's location or locker)
  buyerDestination: {
    type: 'ADDRESS' | 'LOCKER';
    address?: UserLocation;
    lockerId?: string;
    lockerName?: string;
    lockerAddress?: string;
  };
}

// ============================================
// ORDER SHIPPING (After purchase)
// ============================================

/**
 * Shipping data stored with order
 */
export interface OrderShipping {
  // Method used
  method: ShippingMethod;
  serviceLevelCode: string;
  serviceLevelName: string;
  
  // RULE: Locked at purchase, never recalculated
  quotedRateCents: number;
  
  // TCG shipment (populated after booking)
  tcgShipmentId?: number;
  waybillNumber?: string;       // e.g., "TCGD000500"
  trackingUrl?: string;
  
  // Locker PIN (for L2D, L2L, D2L)
  lockerPin?: string;
  
  // Timing
  estimatedDeliveryFrom?: Date;
  estimatedDeliveryTo?: Date;
  
  // Addresses used (snapshot at time of order)
  collectionAddress: TCGAddress | TCGLockerAddress;
  deliveryAddress: TCGAddress | TCGLockerAddress;
  
  // Contacts
  collectionContact: {
    name: string;
    email: string;
    mobile_number: string;      // Format: +27xxxxxxxxx
  };
  deliveryContact: {
    name: string;
    email: string;
    mobile_number: string;
  };
}

// ============================================
// SHIPMENT STATUS
// ============================================

export type ShipmentStatus = 
  // Initial states
  | 'PENDING_BOOKING'           // Waiting for seller to book
  | 'SUBMITTED'                 // Shipment created with TCG
  | 'DEPOSIT_PENDING'           // Waiting for seller to drop at locker
  
  // Collection states
  | 'COLLECTION_ASSIGNED'       // Driver assigned for pickup
  | 'COLLECTED'                 // Parcel collected from seller
  | 'DEPOSITED'                 // Seller dropped at locker
  
  // Transit states
  | 'IN_TRANSIT'                // On the way
  | 'AT_BRANCH'                 // At TCG branch
  
  // Delivery states
  | 'OUT_FOR_DELIVERY'          // With driver for delivery
  | 'READY_FOR_COLLECTION'      // At locker, waiting for buyer
  | 'DELIVERED'                 // Successfully delivered
  | 'COLLECTED_BY_RECIPIENT'    // Buyer collected from locker
  
  // Problem states
  | 'DELIVERY_FAILED_ATTEMPT'   // Failed delivery attempt
  | 'RETURNED'                  // Returned to sender
  | 'CANCELLED';                // Shipment cancelled

export interface TrackingEvent {
  id: number;
  date: Date;
  status: ShipmentStatus;
  message: string;
  location: string;
  source: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert UserLocation to TCG Address format
 */
export function userLocationToTCGAddress(
  location: UserLocation,
  type: 'residential' | 'business' = 'residential',
  company?: string
): TCGAddress {
  const provinceZones: Record<string, string> = {
    'Eastern Cape': 'EC',
    'Free State': 'FS',
    'Gauteng': 'GP',
    'KwaZulu-Natal': 'KZN',
    'Limpopo': 'LP',
    'Mpumalanga': 'MP',
    'Northern Cape': 'NC',
    'North West': 'NW',
    'Western Cape': 'WC',
  };
  
  return {
    lat: location.latitude ?? 0,
    lng: location.longitude ?? 0,
    street_address: location.streetAddress,
    local_area: location.suburbName,
    suburb: location.suburbName,
    city: location.cityName,
    code: location.postalCode,
    zone: provinceZones[location.provinceCode] ?? 'GP',
    country: 'South Africa',
    entered_address: `${location.streetAddress}, ${location.suburbName}, ${location.cityName}, ${location.postalCode}, South Africa`,
    type,
    company,
  };
}

/**
 * Convert ParcelDimensions to TCG Parcel format
 */
export function dimensionsToTCGParcel(
  dimensions: ParcelDimensions,
  description: string
): TCGParcel {
  return {
    submitted_length_cm: dimensions.lengthCm.toString(),
    submitted_width_cm: dimensions.widthCm.toString(),
    submitted_height_cm: dimensions.heightCm.toString(),
    submitted_weight_kg: dimensions.weightKg.toString(),
    parcel_description: description,
  };
}

/**
 * Determine which locker size fits the parcel, in any orientation.
 *
 * A seller can orient the parcel however it fits, so we sort both the parcel's
 * 3 dims and the locker's 3 dims (opening-short, opening-long, depth) and compare
 * smallest-to-smallest. This prevents a tall item being wrongly bumped to a larger
 * size just because the user entered their dims in an order that doesn't match
 * the locker's orientation.
 */
export function getLockerSizeForParcel(
  dimensions: ParcelDimensions
): LockerSize | null {
  const sizes: LockerSize[] = ['V4-XS', 'V4-S', 'V4-M', 'V4-L', 'V4-XL'];

  // Sort parcel dims ascending so we can try the optimal orientation
  const [d1, d2, d3] = [dimensions.widthCm, dimensions.heightCm, dimensions.lengthCm].sort((a, b) => a - b);

  for (const size of sizes) {
    const locker = LOCKER_SIZES[size];
    // Sort locker opening dims: [opening-short, opening-long, depth]
    const [o1, o2, o3] = [locker.width, locker.height, locker.length].sort((a, b) => a - b);
    if (
      d1 <= o1 &&
      d2 <= o2 &&
      d3 <= o3 &&
      dimensions.weightKg <= locker.maxWeight
    ) {
      return size;
    }
  }

  return null; // Parcel too big for any locker
}

/**
 * Check if parcel can fit in a locker
 */
export function canFitInLocker(dimensions: ParcelDimensions): boolean {
  return getLockerSizeForParcel(dimensions) !== null;
}