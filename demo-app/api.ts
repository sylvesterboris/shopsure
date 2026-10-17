import { Router } from 'express';
import type { Request } from 'express';
import { DomainError, toDollars, type Product } from './domain';
import {
  SESSION_COOKIE,
  handle,
  idParam,
  orderDto,
  parse,
  productDto,
  requireAdmin,
  requireUser,
  tokenFrom,
  userDto,
} from './http';
import type { Store } from './store';
import {
  cartItemSchema,
  loginSchema,
  orderInputSchema,
  orderPatchSchema,
  productInputSchema,
  productPatchSchema,
  productQuerySchema,
  quantitySchema,
  registerSchema,
} from './validation';

export function filterProducts(
  products: Product[],
  query: { q?: string | undefined; category?: string | undefined; sort: string },
): Product[] {
  const needle = query.q?.toLowerCase();
  const filtered = products.filter(
    (p) =>
      (!query.category || p.category === query.category) &&
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle)),
  );
  const sorters: Record<string, (a: Product, b: Product) => number> = {
    relevance: (a, b) => a.id - b.id,
    price_asc: (a, b) => a.priceCents - b.priceCents || a.id - b.id,
    price_desc: (a, b) => b.priceCents - a.priceCents || a.id - b.id,
    name_asc: (a, b) => a.name.localeCompare(b.name),
    name_desc: (a, b) => b.name.localeCompare(a.name),
  };
  return filtered.sort(sorters[query.sort] ?? sorters.relevance);
}

function cartDto(store: Store, userId: string): object {
  const totals = store.cartTotals(userId);
  return {
    items: store.cartLines(userId).map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      unitPrice: toDollars(l.product.priceCents),
      quantity: l.quantity,
      lineTotal: toDollars(l.lineTotalCents),
    })),
    itemCount: totals.itemCount,
    subtotal: toDollars(totals.subtotalCents),
    tax: toDollars(totals.taxCents),
    shipping: toDollars(totals.shippingCents),
    total: toDollars(totals.totalCents),
    currency: 'USD',
  };
}

const productIdFrom = (req: Request): number => parse(idParam, req.params.id);

export function apiRouter(store: Store): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ---------- auth ----------

  router.post(
    '/auth/register',
    handle((req, res) => {
      const input = parse(registerSchema, req.body);
      const user = store.createUser({ ...input, role: 'customer' });
      res.status(201).json({ user: userDto(user) });
    }),
  );

  router.post(
    '/auth/login',
    handle((req, res) => {
      const { username, password } = parse(loginSchema, req.body);
      const user = store.authenticate(username, password);
      const token = store.createSession(user.id);
      res.status(200).json({ token, tokenType: 'Bearer', expiresIn: 7200, user: userDto(user) });
    }),
  );

  router.post(
    '/auth/logout',
    handle((req, res) => {
      requireUser(store, req);
      store.revokeSession(tokenFrom(req));
      res.clearCookie(SESSION_COOKIE);
      res.status(204).end();
    }),
  );

  router.get(
    '/auth/me',
    handle((req, res) => {
      res.json({ user: userDto(requireUser(store, req)) });
    }),
  );

  // ---------- products ----------

  router.get(
    '/products',
    handle((req, res) => {
      const query = parse(productQuerySchema, req.query);
      const all = filterProducts(store.listProducts(), query);
      const totalPages = Math.max(1, Math.ceil(all.length / query.limit));
      const start = (query.page - 1) * query.limit;
      res.json({
        data: all.slice(start, start + query.limit).map(productDto),
        pagination: { page: query.page, limit: query.limit, total: all.length, totalPages },
      });
    }),
  );

  router.get(
    '/products/:id',
    handle((req, res) => {
      res.json(productDto(store.getProduct(productIdFrom(req))));
    }),
  );

  router.post(
    '/products',
    handle((req, res) => {
      requireAdmin(store, req);
      const input = parse(productInputSchema, req.body);
      const product = store.createProduct({
        sku: input.sku,
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: Math.round(input.price * 100),
        inStock: input.inStock,
      });
      res.status(201).location(`/api/products/${product.id}`).json(productDto(product));
    }),
  );

  router.put(
    '/products/:id',
    handle((req, res) => {
      requireAdmin(store, req);
      const id = productIdFrom(req);
      const input = parse(productInputSchema, req.body);
      const product = store.updateProduct(id, {
        sku: input.sku,
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: Math.round(input.price * 100),
        inStock: input.inStock,
      });
      res.json(productDto(product));
    }),
  );

  router.patch(
    '/products/:id',
    handle((req, res) => {
      requireAdmin(store, req);
      const id = productIdFrom(req);
      const { price, ...rest } = parse(productPatchSchema, req.body);
      const product = store.updateProduct(id, {
        ...rest,
        ...(price !== undefined ? { priceCents: Math.round(price * 100) } : {}),
      });
      res.json(productDto(product));
    }),
  );

  router.delete(
    '/products/:id',
    handle((req, res) => {
      requireAdmin(store, req);
      store.deleteProduct(productIdFrom(req));
      res.status(204).end();
    }),
  );

  // ---------- cart ----------

  router.get(
    '/cart',
    handle((req, res) => {
      res.json(cartDto(store, requireUser(store, req).id));
    }),
  );

  router.post(
    '/cart/items',
    handle((req, res) => {
      const user = requireUser(store, req);
      const { productId, quantity } = parse(cartItemSchema, req.body);
      store.addToCart(user.id, productId, quantity);
      res.status(201).json(cartDto(store, user.id));
    }),
  );

  router.patch(
    '/cart/items/:id',
    handle((req, res) => {
      const user = requireUser(store, req);
      const quantity = parse(
        quantitySchema,
        (req.body as { quantity?: unknown } | undefined)?.quantity,
      );
      store.setCartQuantity(user.id, productIdFrom(req), quantity);
      res.json(cartDto(store, user.id));
    }),
  );

  router.delete(
    '/cart/items/:id',
    handle((req, res) => {
      const user = requireUser(store, req);
      store.removeFromCart(user.id, productIdFrom(req));
      res.json(cartDto(store, user.id));
    }),
  );

  router.delete(
    '/cart',
    handle((req, res) => {
      store.clearCart(requireUser(store, req).id);
      res.status(204).end();
    }),
  );

  // ---------- orders ----------

  router.post(
    '/orders',
    handle(async (req, res) => {
      const user = requireUser(store, req);
      const input = parse(orderInputSchema, req.body);
      const fromCart = input.items === undefined;
      const lines =
        input.items ??
        store.cartLines(user.id).map((l) => ({ productId: l.product.id, quantity: l.quantity }));
      const key = req.header('Idempotency-Key')?.trim() || undefined;
      const { order, created } = await store.placeOrder(user, input.customer, lines, key);
      if (created && fromCart) store.clearCart(user.id);
      res
        .status(created ? 201 : 200)
        .location(`/api/orders/${order.id}`)
        .json(orderDto(order));
    }),
  );

  router.get(
    '/orders',
    handle(async (req, res) => {
      const user = requireUser(store, req);
      const orders = await store.orders.listByUser(user.id);
      res.json({ data: orders.map(orderDto), total: orders.length });
    }),
  );

  router.get(
    '/orders/:id',
    handle(async (req, res) => {
      const user = requireUser(store, req);
      res.json(orderDto(await store.orderFor(user, String(req.params.id))));
    }),
  );

  router.patch(
    '/orders/:id',
    handle(async (req, res) => {
      const user = requireUser(store, req);
      parse(orderPatchSchema, req.body);
      res.json(orderDto(await store.cancelOrder(user, String(req.params.id))));
    }),
  );

  router.use(() => {
    throw new DomainError(404, 'NOT_FOUND', 'Endpoint not found');
  });

  return router;
}
