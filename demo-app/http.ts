import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DomainError, toDollars, type Order, type Product, type User } from './domain';
import type { Store } from './store';

export const SESSION_COOKIE = 'shopsure_session';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Bearer token for API clients, session cookie for the browser UI. */
export function tokenFrom(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return readCookie(req, SESSION_COOKIE);
}

export function currentUser(store: Store, req: Request): User | undefined {
  return store.userForToken(tokenFrom(req));
}

export function requireUser(store: Store, req: Request): User {
  const user = currentUser(store, req);
  if (!user) throw new DomainError(401, 'UNAUTHENTICATED', 'Authentication is required');
  return user;
}

export function requireAdmin(store: Store, req: Request): User {
  const user = requireUser(store, req);
  if (user.role !== 'admin') {
    throw new DomainError(403, 'FORBIDDEN', 'Administrator role is required');
  }
  return user;
}

/** Parses input with a Zod schema, converting issues into a 400 DomainError. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new DomainError(
    400,
    'VALIDATION_ERROR',
    'Request validation failed',
    result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  );
}

export const idParam = z.coerce
  .number({ error: 'id must be a number' })
  .int('id must be an integer')
  .positive('id must be positive');

type AsyncHandler = (req: Request, res: Response) => Promise<void> | void;

/** Wraps a handler so thrown errors (sync or async) reach the error middleware. */
export const handle =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

export function apiErrorBody(error: DomainError): object {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

export function productDto(p: Product): object {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    category: p.category,
    price: toDollars(p.priceCents),
    currency: 'USD',
    inStock: p.inStock,
  };
}

export function orderDto(o: Order): object {
  return {
    id: o.id,
    status: o.status,
    customer: o.customer,
    items: o.items.map((i) => ({
      productId: i.productId,
      name: i.productName,
      unitPrice: toDollars(i.unitPriceCents),
      quantity: i.quantity,
      lineTotal: toDollars(i.lineTotalCents),
    })),
    subtotal: toDollars(o.subtotalCents),
    tax: toDollars(o.taxCents),
    shipping: toDollars(o.shippingCents),
    total: toDollars(o.totalCents),
    currency: 'USD',
    createdAt: o.createdAt,
  };
}

export function userDto(u: User): object {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}
