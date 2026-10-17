import { z } from 'zod';

/**
 * Response contracts of the ShopSure API, written from the API's documented behaviour
 * (not imported from the server) so they act as an independent check.
 */

const money = z.number().nonnegative().multipleOf(0.01);
const isoDate = z.iso.datetime({ offset: true });

export const UserSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(['customer', 'admin']),
});

export const LoginResponseSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'token must be 64 hex characters'),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: UserSchema,
});

export const UserEnvelopeSchema = z.strictObject({ user: UserSchema });

export const ProductSchema = z.strictObject({
  id: z.number().int().positive(),
  sku: z.string().regex(/^[A-Z]{3}-\d{3}$/),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(['audio', 'wearables', 'accessories', 'home']),
  price: money.positive(),
  currency: z.literal('USD'),
  inStock: z.boolean(),
});

export const ProductListSchema = z.strictObject({
  data: z.array(ProductSchema),
  pagination: z.strictObject({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(1),
  }),
});

export const CartSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      productId: z.number().int().positive(),
      name: z.string(),
      unitPrice: money,
      quantity: z.number().int().min(1).max(10),
      lineTotal: money,
    }),
  ),
  itemCount: z.number().int().min(0),
  subtotal: money,
  tax: money,
  shipping: money,
  total: money,
  currency: z.literal('USD'),
});

export const CustomerSchema = z.strictObject({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  postalCode: z.string().regex(/^\d{6}$/),
});

export const OrderSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(['PLACED', 'CANCELLED']),
  customer: CustomerSchema,
  items: z
    .array(
      z.strictObject({
        productId: z.number().int().positive(),
        name: z.string().min(1),
        unitPrice: money.positive(),
        quantity: z.number().int().min(1).max(10),
        lineTotal: money.positive(),
      }),
    )
    .min(1),
  subtotal: money,
  tax: money,
  shipping: money,
  total: money,
  currency: z.literal('USD'),
  createdAt: isoDate,
});

export const OrderListSchema = z.strictObject({
  data: z.array(OrderSchema),
  total: z.number().int().min(0),
});

export const ErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/, 'error code must be UPPER_SNAKE_CASE'),
    message: z.string().min(1),
    details: z.array(z.strictObject({ field: z.string(), message: z.string() })).optional(),
  }),
});

export const HealthSchema = z.strictObject({
  status: z.literal('ok'),
  storage: z.enum(['memory', 'postgres']),
});

export type User = z.infer<typeof UserSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type ProductList = z.infer<typeof ProductListSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;
