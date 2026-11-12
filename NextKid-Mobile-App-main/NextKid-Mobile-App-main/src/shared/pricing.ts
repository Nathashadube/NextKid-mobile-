/**
 * NextKid — Buyer Price Calculator
 *
 * Reverse-calculates from the seller's desired payout.
 * RULE: Never add fees on top of the seller price — always gross up
 * so the buyer funds everything and the seller receives exactly what they asked.
 *
 * Delivery cost is NOT included here — the buyer chooses a delivery method
 * (school pick-up, courier, etc.) at checkout and pays that separately.
 *
 * Formula (from Praesignis Finance calculation sheet):
 *   Step 1: seller_price                        (guaranteed seller payout)
 *   Step 2: ÷ (1 - platform_rate)               (gross up for NextKid markup)
 *   Step 3: ÷ (1 - gateway_rate)                (gross up for Stitch fee)
 *   Step 4: CEILING(raw ÷ roundTo) × roundTo    (round UP to nearest R25)
 *   Step 5: admin_fee = buyer_price - buyer_raw  (rounding surplus → Praesignis Finance)
 */

export interface PricingConfig {
  platformRate: number   // NextKid markup grossed up e.g. 0.075 (testing) → change on live
  gatewayRate:  number   // Stitch fee grossed up e.g. 0.025
  roundTo:      number   // Round up to nearest e.g. 25
}

export interface PriceBreakdown {
  sellerPayoutCents:    number   // Step 1 — guaranteed seller payout
  platformFeeCents:     number   // Step 2 — NextKid markup (grossed up)
  afterMarkupCents:     number   // Step 2 result
  gatewayFeeCents:      number   // Step 3 — Stitch fee (grossed up)
  buyerRawCents:        number   // Step 3 result — before rounding
  buyerPriceCents:      number   // Step 4 — final rounded buyer price
  adminFeeCents:        number   // Step 5 — rounding surplus (Praesignis Finance)
  buyerPriceRands:      number
  sellerPayoutRands:    number
}

/**
 * Default config — matches the Praesignis Finance calculation sheet.
 * platformRate 7.5% is for TESTING ONLY — update before going live.
 */
export const DEFAULT_PRICING: PricingConfig = {
  platformRate: 0.075,  // 7.5% NextKid markup (testing — change on live)
  gatewayRate:  0.025,  // 2.5% Stitch fee
  roundTo:      25,     // Round UP to nearest R25
}

function roundUpTo(value: number, increment: number): number {
  return Math.ceil(value / increment) * increment
}

/**
 * Calculate what the buyer pays given the seller's desired payout (in rands).
 * Delivery cost is added separately at checkout, once the buyer picks a method.
 *
 * Example (R180 seller payout):
 *   Step 1: R180.00  (seller payout)
 *   Step 2: R194.59  (÷ 0.925 for 7.5% markup)
 *   Step 3: R199.58  (÷ 0.975 for 2.5% Stitch)
 *   Step 4: R200.00  (rounded UP to nearest R25)
 *   Step 5: R0.42    (admin fee = rounding surplus)
 */
export function calculateBuyerPrice(
  sellerPayoutRands: number,
  config: PricingConfig = DEFAULT_PRICING
): PriceBreakdown {
  // Step 1 — seller payout in cents
  const sellerPayoutCents = Math.round(sellerPayoutRands * 100)

  // Step 2 — gross up for NextKid platform markup
  // seller payout ÷ (1 - platformRate) → buyer funds the markup
  const afterMarkupCents  = Math.round(sellerPayoutCents / (1 - config.platformRate))
  const platformFeeCents  = afterMarkupCents - sellerPayoutCents

  // Step 3 — gross up for Stitch gateway fee
  // after_markup ÷ (1 - gatewayRate) → buyer funds the gateway fee
  const buyerRawCents     = Math.round(afterMarkupCents / (1 - config.gatewayRate))
  const gatewayFeeCents   = buyerRawCents - afterMarkupCents

  // Step 4 — round UP to nearest R25
  const roundCents        = config.roundTo * 100
  const buyerPriceCents   = roundUpTo(buyerRawCents, roundCents)

  // Step 5 — admin fee is the rounding surplus (goes to Praesignis Finance)
  const adminFeeCents     = buyerPriceCents - buyerRawCents

  return {
    sellerPayoutCents,
    platformFeeCents,
    afterMarkupCents,
    gatewayFeeCents,
    buyerRawCents,
    buyerPriceCents,
    adminFeeCents,
    buyerPriceRands:   buyerPriceCents / 100,
    sellerPayoutRands,
  }
}

/** Format cents as "R 200.00" */
export function fmtRands(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
