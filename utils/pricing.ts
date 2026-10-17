/**
 * Pricing rules of the store under test, re-implemented independently as a test oracle
 * (tests must not import application code to compute their expected values).
 */
export const PRICING = {
  taxRate: 0.08,
  freeShippingThresholdCents: 5000,
  flatShippingCents: 500,
  maxQuantityPerLine: 10,
} as const;

export type ExpectedTotals = {
  itemCount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
};

export function expectedTotals(
  lines: Array<{ unitPrice: number; quantity: number }>,
): ExpectedTotals {
  const subtotalCents = lines.reduce(
    (sum, l) => sum + Math.round(l.unitPrice * 100) * l.quantity,
    0,
  );
  const taxCents = Math.round(subtotalCents * PRICING.taxRate);
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= PRICING.freeShippingThresholdCents
      ? 0
      : PRICING.flatShippingCents;
  return {
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: subtotalCents / 100,
    tax: taxCents / 100,
    shipping: shippingCents / 100,
    total: (subtotalCents + taxCents + shippingCents) / 100,
  };
}

/** Formats an amount the way the storefront displays it, e.g. 54 -> "$54.00". */
export const money = (amount: number): string => `$${amount.toFixed(2)}`;
