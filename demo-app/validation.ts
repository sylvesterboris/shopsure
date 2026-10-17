import { z } from 'zod';
import { CATEGORIES, MAX_QUANTITY_PER_LINE } from './domain';

const NAME_PATTERN = /^[\p{L}][\p{L} '-]*$/u;

const personName = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(50, `${label} must be at most 50 characters`)
    .regex(NAME_PATTERN, `${label} may only contain letters, spaces, apostrophes and hyphens`);

export const customerSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address'),
  postalCode: z
    .string({ error: 'Postal code is required' })
    .trim()
    .min(1, 'Postal code is required')
    .regex(/^\d{6}$/, 'Postal code must be exactly 6 digits'),
});

export const quantitySchema = z.coerce
  .number({ error: 'Quantity must be a number' })
  .int('Quantity must be a whole number')
  .min(1, `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`)
  .max(MAX_QUANTITY_PER_LINE, `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`);

export const loginSchema = z.object({
  username: z.string({ error: 'username is required' }).min(1, 'username is required'),
  password: z.string({ error: 'password is required' }).min(1, 'password is required'),
});

export const registerSchema = z.object({
  username: z
    .string({ error: 'username is required' })
    .regex(/^[a-z0-9_]{3,32}$/, 'username must be 3-32 characters of a-z, 0-9 or _'),
  password: z
    .string({ error: 'password is required' })
    .min(8, 'password must be at least 8 characters')
    .max(64, 'password must be at most 64 characters'),
  displayName: z
    .string({ error: 'displayName is required' })
    .trim()
    .min(1, 'displayName is required')
    .max(50, 'displayName must be at most 50 characters'),
});

const price = z
  .number({ error: 'price must be a number' })
  .min(0.01, 'price must be at least 0.01')
  .max(10000, 'price must be at most 10000')
  .refine(
    (v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
    {
      message: 'price must have at most 2 decimal places',
    },
  );

// Field rules without defaults. PATCH must be built from these: a schema with
// .default() still fills in missing keys after .partial(), which silently
// overwrote description/inStock on every partial update (BUG-002).
const productFields = {
  sku: z.string({ error: 'sku is required' }).regex(/^[A-Z]{3}-\d{3}$/, 'sku must match AAA-000'),
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required').max(80),
  description: z.string().trim().max(500),
  category: z.enum(CATEGORIES, { error: `category must be one of ${CATEGORIES.join(', ')}` }),
  price,
  inStock: z.boolean(),
};

export const productInputSchema = z.object({
  ...productFields,
  description: productFields.description.default(''),
  inStock: productFields.inStock.default(true),
});

export const productPatchSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be between 1 and 50')
    .max(50, 'limit must be between 1 and 50')
    .default(20),
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  sort: z
    .enum(['relevance', 'price_asc', 'price_desc', 'name_asc', 'name_desc'])
    .default('relevance'),
});

export const cartItemSchema = z.object({
  productId: z.number({ error: 'productId is required' }).int().positive(),
  quantity: z.number({ error: 'quantity is required' }).int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const orderInputSchema = z.object({
  customer: customerSchema,
  items: z
    .array(
      z.object({
        productId: z.number({ error: 'productId is required' }).int().positive(),
        quantity: z
          .number({ error: 'quantity is required' })
          .int()
          .min(1, `quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`)
          .max(MAX_QUANTITY_PER_LINE, `quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`),
      }),
    )
    .max(50)
    .optional(),
});

export const orderPatchSchema = z.object({ status: z.literal('CANCELLED') }).strict();
