// NextKid shared types, utilities, and constants (inlined from packages/shared)

export * from './types';
export * from './constants';

// Shipping helpers and types
export {
  canFitInLocker,
  getLockerSizeForParcel,
  dimensionsToTCGParcel,
  userLocationToTCGAddress,
  LOCKER_SIZES,
} from './types/shipping';
export type {
  ParcelDimensions,
  SellerShippingOption,
  ShippingMethod,
  TCGParcel,
  TCGAddress,
  TCGLockerAddress,
  TCGRateOption,
  ShippingQuote,
  CheckoutShipping,
  OrderShipping,
  LockerSize,
} from './types/shipping';

// Location types
export type { UserLocation } from './types/location';

// Pricing calculator
export {
  calculateBuyerPrice,
  fmtRands,
  DEFAULT_PRICING,
} from './pricing';
export type { PricingConfig, PriceBreakdown } from './pricing';
