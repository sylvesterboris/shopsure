import {
  CATEGORIES,
  MAX_QUANTITY_PER_LINE,
  formatMoney,
  type Customer,
  type Order,
  type Product,
  type Totals,
  type User,
} from './domain';
import type { CartLine } from './store';

export const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface LayoutOptions {
  title: string;
  user?: User | undefined;
  cartCount?: number;
  body: string;
  scripts?: string[];
}

export function layout({ title, user, cartCount = 0, body, scripts = [] }: LayoutOptions): string {
  const nav = user
    ? `<nav aria-label="Main">
        <a href="/products">Products</a>
        <a href="/cart" data-testid="cart-link">Cart <span class="badge" data-testid="cart-count">${cartCount}</span></a>
      </nav>
      <div class="user">
        <span data-testid="current-user">Signed in as ${escapeHtml(user.displayName)}</span>
        <form method="post" action="/logout"><button type="submit" class="link-button">Log out</button></form>
      </div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · ShopSure</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="/products">ShopSure</a>
    ${nav}
  </header>
  <main id="main">
${body}
  </main>
  <footer class="site-footer">Local demo store for test automation. Not a real shop.</footer>
  ${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n  ')}
</body>
</html>`;
}

const alert = (message: string | undefined, testId: string): string =>
  message
    ? `<div class="alert alert-error" role="alert" data-testid="${testId}">${escapeHtml(message)}</div>`
    : '';

const notice = (message: string | undefined, testId: string): string =>
  message
    ? `<div class="alert alert-info" role="status" data-testid="${testId}">${escapeHtml(message)}</div>`
    : '';

export function loginPage(opts: {
  error?: string;
  info?: string;
  username?: string;
  next?: string;
}): string {
  return layout({
    title: 'Log in',
    body: `
    <section class="card narrow">
      <h1>Sign in to ShopSure</h1>
      ${notice(opts.info, 'login-info')}
      ${alert(opts.error, 'login-error')}
      <form method="post" action="/login" novalidate>
        <input type="hidden" name="next" value="${escapeHtml(opts.next ?? '')}">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" value="${escapeHtml(opts.username ?? '')}">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password">
        <button type="submit" class="primary">Log in</button>
      </form>
    </section>`,
  });
}

export function productsPage(user: User, cartCount: number): string {
  const categoryOptions = CATEGORIES.map(
    (c) => `<option value="${c}">${capitalize(c)}</option>`,
  ).join('');
  return layout({
    title: 'Products',
    user,
    cartCount,
    scripts: ['/static/products.js'],
    body: `
    <h1>Products</h1>
    <form class="filters" role="search" data-testid="product-filters">
      <div>
        <label for="q">Search products</label>
        <input id="q" name="q" type="search" maxlength="100">
      </div>
      <button type="submit">Search</button>
      <div>
        <label for="category">Category</label>
        <select id="category" name="category"><option value="">All categories</option>${categoryOptions}</select>
      </div>
      <div>
        <label for="sort">Sort by</label>
        <select id="sort" name="sort">
          <option value="relevance">Featured</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name_asc">Name: A to Z</option>
          <option value="name_desc">Name: Z to A</option>
        </select>
      </div>
    </form>
    <p data-testid="results-count" aria-live="polite">Loading products…</p>
    <div role="alert" data-testid="products-error" class="alert alert-error" hidden>
      We couldn't load products. Please try again.
      <button type="button" data-testid="retry-button">Retry</button>
    </div>
    <p data-testid="empty-state" hidden>No products match your search.</p>
    <ul class="product-grid" data-testid="product-list" aria-label="Product results"></ul>
    <div class="toast" role="status" data-testid="toast" aria-live="polite"></div>`,
  });
}

export function productDetailPage(opts: {
  user: User;
  cartCount: number;
  product: Product;
  added?: number | undefined;
  error?: string | undefined;
  quantity?: string | undefined;
}): string {
  const p = opts.product;
  const addedMsg =
    opts.added !== undefined ? `Added ${opts.added} × ${p.name} to your cart.` : undefined;
  return layout({
    title: p.name,
    user: opts.user,
    cartCount: opts.cartCount,
    body: `
    <p><a href="/products">← Back to products</a></p>
    <article class="card" data-testid="product-detail" data-product-id="${p.id}">
      <h1 data-testid="product-name">${escapeHtml(p.name)}</h1>
      <p class="price" data-testid="product-price">${formatMoney(p.priceCents)}</p>
      <p data-testid="product-category">Category: ${escapeHtml(capitalize(p.category))}</p>
      <p data-testid="product-description">${escapeHtml(p.description)}</p>
      <p data-testid="product-sku">SKU: ${escapeHtml(p.sku)}</p>
      ${notice(addedMsg, 'add-to-cart-message')}
      ${alert(opts.error, 'add-to-cart-error')}
      ${
        p.inStock
          ? `<form method="post" action="/cart/add" class="inline-form" novalidate>
        <input type="hidden" name="productId" value="${p.id}">
        <label for="quantity">Quantity</label>
        <input id="quantity" name="quantity" type="number" min="1" max="${MAX_QUANTITY_PER_LINE}" value="${escapeHtml(opts.quantity ?? '1')}">
        <button type="submit" class="primary">Add to cart</button>
      </form>`
          : '<p class="out-of-stock" data-testid="out-of-stock">Out of stock</p>'
      }
    </article>`,
  });
}

function summary(totals: Totals): string {
  return `<dl class="summary" data-testid="order-summary">
      <dt>Items</dt><dd data-testid="summary-items">${totals.itemCount}</dd>
      <dt>Subtotal</dt><dd data-testid="summary-subtotal">${formatMoney(totals.subtotalCents)}</dd>
      <dt>Tax (8%)</dt><dd data-testid="summary-tax">${formatMoney(totals.taxCents)}</dd>
      <dt>Shipping</dt><dd data-testid="summary-shipping">${totals.shippingCents === 0 ? 'Free' : formatMoney(totals.shippingCents)}</dd>
      <dt>Total</dt><dd data-testid="summary-total"><strong>${formatMoney(totals.totalCents)}</strong></dd>
    </dl>`;
}

export function cartPage(opts: {
  user: User;
  lines: CartLine[];
  totals: Totals;
  info?: string | undefined;
  error?: string | undefined;
}): string {
  const rows = opts.lines
    .map((l) => {
      const name = escapeHtml(l.product.name);
      return `<tr data-testid="cart-item" data-product-id="${l.product.id}">
        <td data-testid="item-name"><a href="/products/${l.product.id}">${name}</a></td>
        <td data-testid="item-price">${formatMoney(l.product.priceCents)}</td>
        <td>
          <form method="post" action="/cart/update" class="inline-form" novalidate>
            <input type="hidden" name="productId" value="${l.product.id}">
            <input name="quantity" type="number" min="1" max="${MAX_QUANTITY_PER_LINE}" value="${l.quantity}" aria-label="Quantity for ${name}">
            <button type="submit" aria-label="Update quantity for ${name}">Update</button>
          </form>
        </td>
        <td data-testid="item-total">${formatMoney(l.lineTotalCents)}</td>
        <td>
          <form method="post" action="/cart/remove">
            <input type="hidden" name="productId" value="${l.product.id}">
            <button type="submit" aria-label="Remove ${name}">Remove</button>
          </form>
        </td>
      </tr>`;
    })
    .join('');
  const content =
    opts.lines.length === 0
      ? `<p data-testid="empty-cart">Your cart is empty.</p>
         <p><a href="/products">Continue shopping</a></p>`
      : `<table class="cart-table">
          <caption class="visually-hidden">Items in your cart</caption>
          <thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Total</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${summary(opts.totals)}
        <p><a class="button primary" href="/checkout">Proceed to checkout</a></p>`;
  return layout({
    title: 'Cart',
    user: opts.user,
    cartCount: opts.totals.itemCount,
    body: `
    <h1>Your cart</h1>
    ${notice(opts.info, 'cart-message')}
    ${alert(opts.error, 'cart-error')}
    ${content}`,
  });
}

type FieldErrors = Partial<Record<keyof Customer, string>>;

export function checkoutPage(opts: {
  user: User;
  lines: CartLine[];
  totals: Totals;
  token: string;
  values?: Partial<Customer>;
  errors?: FieldErrors;
}): string {
  const errors = opts.errors ?? {};
  const field = (
    name: keyof Customer,
    label: string,
    type = 'text',
    autocomplete = 'off',
  ): string => {
    const error = errors[name];
    return `<div class="field">
        <label for="${name}">${label}</label>
        <input id="${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" value="${escapeHtml(opts.values?.[name] ?? '')}"${error ? ` aria-invalid="true" aria-describedby="${name}-error"` : ''}>
        ${error ? `<p class="field-error" id="${name}-error" data-testid="${name}-error">${escapeHtml(error)}</p>` : ''}
      </div>`;
  };
  const hasErrors = Object.keys(errors).length > 0;
  const items = opts.lines
    .map(
      (l) =>
        `<li>${escapeHtml(l.product.name)} × ${l.quantity} — ${formatMoney(l.lineTotalCents)}</li>`,
    )
    .join('');
  return layout({
    title: 'Checkout',
    user: opts.user,
    cartCount: opts.totals.itemCount,
    scripts: ['/static/checkout.js'],
    body: `
    <h1>Checkout</h1>
    ${alert(hasErrors ? 'Please correct the highlighted fields.' : undefined, 'checkout-error')}
    <div class="checkout">
      <form method="post" action="/checkout" novalidate data-testid="checkout-form" class="card">
        <h2>Shipping details</h2>
        <input type="hidden" name="checkoutToken" value="${escapeHtml(opts.token)}">
        ${field('firstName', 'First name', 'text', 'given-name')}
        ${field('lastName', 'Last name', 'text', 'family-name')}
        ${field('email', 'Email', 'email', 'email')}
        ${field('postalCode', 'Postal code', 'text', 'postal-code')}
        <button type="submit" class="primary">Place order</button>
      </form>
      <aside class="card" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Order summary</h2>
        <ul data-testid="checkout-items">${items}</ul>
        ${summary(opts.totals)}
      </aside>
    </div>`,
  });
}

export function confirmationPage(user: User, cartCount: number, order: Order): string {
  const rows = order.items
    .map(
      (i) => `<tr data-testid="order-item">
        <td>${escapeHtml(i.productName)}</td>
        <td>${formatMoney(i.unitPriceCents)}</td>
        <td>${i.quantity}</td>
        <td>${formatMoney(i.lineTotalCents)}</td>
      </tr>`,
    )
    .join('');
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  return layout({
    title: 'Order confirmation',
    user,
    cartCount,
    body: `
    <section class="card">
      <h1>Thank you for your order!</h1>
      <p data-testid="order-id">Order number: <code>${escapeHtml(order.id)}</code></p>
      <p data-testid="order-status">Status: ${escapeHtml(order.status)}</p>
      <p data-testid="order-customer">Shipping to ${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}, ${escapeHtml(order.customer.postalCode)}</p>
      <table class="cart-table">
        <caption class="visually-hidden">Ordered items</caption>
        <thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${summary({
        itemCount,
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
      })}
      <p><a href="/products">Continue shopping</a></p>
    </section>`,
  });
}

export function notFoundPage(opts: {
  user?: User | undefined;
  cartCount?: number;
  heading: string;
  message: string;
}): string {
  return layout({
    title: opts.heading,
    user: opts.user,
    cartCount: opts.cartCount ?? 0,
    body: `
    <section class="card narrow">
      <h1>${escapeHtml(opts.heading)}</h1>
      <p data-testid="not-found-message">${escapeHtml(opts.message)}</p>
      <p><a href="/products">Back to products</a></p>
    </section>`,
  });
}
