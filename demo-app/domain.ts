/**
 * Domain model and pricing rules for the local ShopSure demo store.
 * All money is held in integer cents to avoid floating-point drift.
 */

export const CATEGORIES = ['audio', 'wearables', 'accessories', 'home'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Role = 'customer' | 'admin';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  locked: boolean;
  passwordHash: string;
  salt: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  inStock: boolean;
  seed: boolean;
}

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  postalCode: string;
}

export interface OrderItem {
  productId: number;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export type OrderStatus = 'PLACED' | 'CANCELLED';

export interface Order {
  id: string;
  userId: string;
  username: string;
  customer: Customer;
  items: OrderItem[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
}

export interface Totals {
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

export const MAX_QUANTITY_PER_LINE = 10;
export const TAX_RATE = 0.08;
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;
export const FLAT_SHIPPING_CENTS = 500;

export function calculateTotals(
  lines: Array<{ unitPriceCents: number; quantity: number }>,
): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  return {
    itemCount,
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
  };
}

export const toDollars = (cents: number): number => Math.round(cents) / 100;
export const formatMoney = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export const SEED_PRODUCTS: Omit<Product, 'seed'>[] = [
  {
    id: 1,
    sku: 'AUD-001',
    name: 'Aurora Wireless Headphones',
    category: 'audio',
    priceCents: 8999,
    inStock: true,
    description: 'Over-ear Bluetooth headphones with 30-hour battery life.',
  },
  {
    id: 2,
    sku: 'AUD-002',
    name: 'Pulse Bluetooth Speaker',
    category: 'audio',
    priceCents: 4999,
    inStock: true,
    description: 'Portable waterproof speaker with deep bass.',
  },
  {
    id: 3,
    sku: 'AUD-003',
    name: 'Echo Earbuds',
    category: 'audio',
    priceCents: 2500,
    inStock: true,
    description: 'Compact true-wireless earbuds with charging case.',
  },
  {
    id: 4,
    sku: 'WRB-001',
    name: 'Stride Fitness Band',
    category: 'wearables',
    priceCents: 3950,
    inStock: true,
    description: 'Step, sleep and heart-rate tracking band.',
  },
  {
    id: 5,
    sku: 'WRB-002',
    name: 'Orbit Smartwatch',
    category: 'wearables',
    priceCents: 19900,
    inStock: true,
    description: 'AMOLED smartwatch with GPS and contactless pay.',
  },
  {
    id: 6,
    sku: 'ACC-001',
    name: 'Nimbus Phone Case',
    category: 'accessories',
    priceCents: 1299,
    inStock: true,
    description: 'Shock-absorbent slim case.',
  },
  {
    id: 7,
    sku: 'ACC-002',
    name: 'Volt USB-C Charger',
    category: 'accessories',
    priceCents: 2500,
    inStock: true,
    description: '65W GaN fast charger.',
  },
  {
    id: 8,
    sku: 'ACC-003',
    name: 'Atlas Laptop Backpack',
    category: 'accessories',
    priceCents: 6400,
    inStock: true,
    description: 'Water-resistant backpack for 15-inch laptops.',
  },
  {
    id: 9,
    sku: 'ACC-004',
    name: 'Sticker Pack',
    category: 'accessories',
    priceCents: 99,
    inStock: true,
    description: 'Ten vinyl stickers.',
  },
  {
    id: 10,
    sku: 'HOM-001',
    name: 'Lumen Desk Lamp',
    category: 'home',
    priceCents: 3475,
    inStock: true,
    description: 'Dimmable LED lamp with USB port.',
  },
  {
    id: 11,
    sku: 'HOM-002',
    name: 'Haven Coffee Mug',
    category: 'home',
    priceCents: 1549,
    inStock: true,
    description: 'Double-walled ceramic mug, 350 ml.',
  },
  {
    id: 12,
    sku: 'HOM-003',
    name: 'Zen Aroma Diffuser',
    category: 'home',
    priceCents: 2995,
    inStock: false,
    description: 'Ultrasonic diffuser with ambient light.',
  },
];
