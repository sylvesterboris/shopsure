import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { DomainError, type Customer, type User } from './domain';
import { SESSION_COOKIE, currentUser, handle, idParam, tokenFrom } from './http';
import type { Store } from './store';
import { customerSchema, quantitySchema } from './validation';
import {
  cartPage,
  checkoutPage,
  confirmationPage,
  loginPage,
  notFoundPage,
  productDetailPage,
  productsPage,
} from './views';

/** Only allow same-site relative redirects to avoid an open redirect. */
function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/products';
}

const body = (req: Request): Record<string, string> => (req.body ?? {}) as Record<string, string>;

export function pageRouter(store: Store): Router {
  const router = Router();
  const cartCount = (user: User): number => store.cartTotals(user.id).itemCount;

  /** Returns the signed-in user or redirects to the login page. */
  const signedIn = (req: Request, res: Response): User | undefined => {
    const user = currentUser(store, req);
    if (!user) res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    return user;
  };

  router.get('/', (req, res) => {
    res.redirect(currentUser(store, req) ? '/products' : '/login');
  });

  router.get('/login', (req, res) => {
    if (currentUser(store, req)) {
      res.redirect(safeNext(req.query.next));
      return;
    }
    res.send(
      loginPage({
        next: typeof req.query.next === 'string' ? req.query.next : '',
        ...(req.query.loggedOut ? { info: 'You have been logged out.' } : {}),
        ...(req.query.next ? { info: 'Please log in to continue.' } : {}),
      }),
    );
  });

  router.post('/login', (req, res) => {
    const { username = '', password = '', next = '' } = body(req);
    const fail = (status: number, error: string): void => {
      res.status(status).send(loginPage({ error, username, next }));
    };
    if (!username.trim() && !password) return fail(400, 'Username and password are required.');
    if (!username.trim()) return fail(400, 'Username is required.');
    if (!password) return fail(400, 'Password is required.');
    try {
      const user = store.authenticate(username.trim(), password);
      const token = store.createSession(user.id);
      res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
      res.redirect(303, safeNext(next));
    } catch (error) {
      if (error instanceof DomainError) return fail(error.status, error.message);
      throw error;
    }
  });

  router.post('/logout', (req, res) => {
    store.revokeSession(tokenFrom(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect(303, '/login?loggedOut=1');
  });

  router.get('/products', (req, res) => {
    const user = signedIn(req, res);
    if (user) res.send(productsPage(user, cartCount(user)));
  });

  router.get('/products/:id', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    const id = idParam.safeParse(req.params.id);
    const product = id.success ? store.listProducts().find((p) => p.id === id.data) : undefined;
    if (!product) {
      res.status(404).send(
        notFoundPage({
          user,
          cartCount: cartCount(user),
          heading: 'Product not found',
          message: "The product you're looking for doesn't exist or is no longer available.",
        }),
      );
      return;
    }
    const added = Number(req.query.added);
    res.send(
      productDetailPage({
        user,
        cartCount: cartCount(user),
        product,
        added: Number.isInteger(added) && added > 0 ? added : undefined,
      }),
    );
  });

  router.post('/cart/add', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    const { productId = '', quantity = '' } = body(req);
    const id = Number(productId);
    try {
      const qty = quantitySchema.safeParse(quantity);
      if (!qty.success)
        throw new DomainError(400, 'INVALID_QUANTITY', 'Quantity must be between 1 and 10.');
      store.addToCart(user.id, id, qty.data);
      res.redirect(303, `/products/${id}?added=${qty.data}`);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const product = store.listProducts().find((p) => p.id === id);
      if (!product) {
        res
          .status(404)
          .send(notFoundPage({ user, heading: 'Product not found', message: error.message }));
        return;
      }
      res.status(error.status).send(
        productDetailPage({
          user,
          cartCount: cartCount(user),
          product,
          error: error.message.endsWith('.') ? error.message : `${error.message}.`,
          quantity,
        }),
      );
    }
  });

  const renderCart = (user: User, info?: string, error?: string): string =>
    cartPage({
      user,
      lines: store.cartLines(user.id),
      totals: store.cartTotals(user.id),
      info,
      error,
    });

  router.get('/cart', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    const info = req.query.updated
      ? 'Cart updated.'
      : req.query.removed
        ? 'Item removed from cart.'
        : undefined;
    res.send(renderCart(user, info));
  });

  router.post('/cart/update', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    const { productId = '', quantity = '' } = body(req);
    const qty = quantitySchema.safeParse(quantity);
    if (!qty.success) {
      res.status(400).send(renderCart(user, undefined, 'Quantity must be between 1 and 10.'));
      return;
    }
    try {
      store.setCartQuantity(user.id, Number(productId), qty.data);
      res.redirect(303, '/cart?updated=1');
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      res.status(error.status).send(renderCart(user, undefined, `${error.message}.`));
    }
  });

  router.post('/cart/remove', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    try {
      store.removeFromCart(user.id, Number(body(req).productId));
      res.redirect(303, '/cart?removed=1');
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      res.status(error.status).send(renderCart(user, undefined, `${error.message}.`));
    }
  });

  router.get('/checkout', (req, res) => {
    const user = signedIn(req, res);
    if (!user) return;
    const lines = store.cartLines(user.id);
    if (lines.length === 0) {
      res.redirect(303, '/cart');
      return;
    }
    res.send(checkoutPage({ user, lines, totals: store.cartTotals(user.id), token: randomUUID() }));
  });

  router.post(
    '/checkout',
    handle(async (req, res) => {
      const user = signedIn(req, res);
      if (!user) return;
      const { checkoutToken = '', ...fields } = body(req);
      const parsed = customerSchema.safeParse(fields);
      if (!parsed.success) {
        const errors: Partial<Record<keyof Customer, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof Customer;
          errors[key] ??= issue.message;
        }
        res.status(400).send(
          checkoutPage({
            user,
            lines: store.cartLines(user.id),
            totals: store.cartTotals(user.id),
            token: checkoutToken || randomUUID(),
            values: fields,
            errors,
          }),
        );
        return;
      }
      const lines = store
        .cartLines(user.id)
        .map((l) => ({ productId: l.product.id, quantity: l.quantity }));
      try {
        const { order, created } = await store.placeOrder(
          user,
          parsed.data,
          lines,
          checkoutToken || undefined,
        );
        if (created) store.clearCart(user.id);
        res.redirect(303, `/orders/${order.id}`);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'EMPTY_ORDER') {
          res.redirect(303, '/cart');
          return;
        }
        throw error;
      }
    }),
  );

  router.get(
    '/orders/:id',
    handle(async (req, res) => {
      const user = signedIn(req, res);
      if (!user) return;
      try {
        const order = await store.orderFor(user, String(req.params.id));
        res.send(confirmationPage(user, cartCount(user), order));
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        res.status(404).send(
          notFoundPage({
            user,
            cartCount: cartCount(user),
            heading: 'Order not found',
            message: 'We could not find that order.',
          }),
        );
      }
    }),
  );

  return router;
}
