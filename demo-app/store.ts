import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  DomainError,
  MAX_QUANTITY_PER_LINE,
  SEED_PRODUCTS,
  calculateTotals,
  type Customer,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Product,
  type Role,
  type Totals,
  type User,
} from './domain';

/** Persistence boundary for orders. In-memory by default, Postgres when DATABASE_URL is set. */
export interface OrderRepository {
  readonly kind: 'memory' | 'postgres';
  init(products: Product[]): Promise<void>;
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | undefined>;
  listByUser(userId: string): Promise<Order[]>;
  updateStatus(id: string, status: OrderStatus): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly kind = 'memory' as const;
  private readonly orders = new Map<string, Order>();

  async init(): Promise<void> {}
  async save(order: Order): Promise<void> {
    this.orders.set(order.id, structuredClone(order));
  }
  async findById(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : undefined;
  }
  async listByUser(userId: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(o));
  }
  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    const order = this.orders.get(id);
    if (order) order.status = status;
  }
  async close(): Promise<void> {}
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex');
}

export interface SeedAccount {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  locked?: boolean;
}

export interface CartLine {
  product: Product;
  quantity: number;
  lineTotalCents: number;
}

/**
 * Application state. Users, sessions and carts live in memory (they are reset on
 * restart); orders go through the configured OrderRepository.
 */
export class Store {
  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: number }>();
  private readonly carts = new Map<string, Map<number, number>>();
  private readonly products = new Map<number, Product>();
  private readonly idempotency = new Map<string, string>();
  private readonly pendingOrders = new Map<string, Promise<{ order: Order; created: boolean }>>();
  private nextProductId: number;

  constructor(
    readonly orders: OrderRepository,
    seedAccounts: SeedAccount[],
  ) {
    for (const p of SEED_PRODUCTS) this.products.set(p.id, { ...p, seed: true });
    this.nextProductId = SEED_PRODUCTS.length + 1;
    for (const account of seedAccounts) this.createUser(account);
  }

  async init(): Promise<void> {
    await this.orders.init([...this.products.values()].filter((p) => p.seed));
  }

  // ---------- users & sessions ----------

  createUser(input: SeedAccount): User {
    if ([...this.users.values()].some((u) => u.username === input.username)) {
      throw new DomainError(409, 'USERNAME_TAKEN', 'Username is already taken');
    }
    const salt = randomBytes(16).toString('hex');
    const user: User = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      locked: input.locked ?? false,
      salt,
      passwordHash: hashPassword(input.password, salt),
    };
    this.users.set(user.id, user);
    return user;
  }

  authenticate(username: string, password: string): User {
    const user = [...this.users.values()].find((u) => u.username === username);
    const candidate = hashPassword(password, user?.salt ?? 'no-user-salt');
    const valid =
      user !== undefined &&
      timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'));
    if (!valid) throw new DomainError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    if (user.locked)
      throw new DomainError(403, 'ACCOUNT_LOCKED', 'This account is locked. Contact support.');
    return user;
  }

  createSession(userId: string): string {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  }

  userForToken(token: string | undefined): User | undefined {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return this.users.get(session.userId);
  }

  revokeSession(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  // ---------- products ----------

  listProducts(): Product[] {
    return [...this.products.values()];
  }

  getProduct(id: number): Product {
    const product = this.products.get(id);
    if (!product) throw new DomainError(404, 'PRODUCT_NOT_FOUND', `Product ${id} was not found`);
    return product;
  }

  createProduct(input: Omit<Product, 'id' | 'seed'>): Product {
    this.assertUniqueSku(input.sku);
    const product: Product = { ...input, id: this.nextProductId++, seed: false };
    this.products.set(product.id, product);
    return product;
  }

  updateProduct(id: number, changes: Partial<Omit<Product, 'id' | 'seed'>>): Product {
    const product = this.getProduct(id);
    this.assertMutable(product);
    if (changes.sku !== undefined && changes.sku !== product.sku) this.assertUniqueSku(changes.sku);
    const updated = { ...product, ...changes };
    this.products.set(id, updated);
    return updated;
  }

  deleteProduct(id: number): void {
    this.assertMutable(this.getProduct(id));
    this.products.delete(id);
    for (const cart of this.carts.values()) cart.delete(id);
  }

  private assertMutable(product: Product): void {
    // Seed catalogue is read-only so parallel tests can rely on it.
    if (product.seed) {
      throw new DomainError(
        403,
        'SEED_PRODUCT_READ_ONLY',
        'Seed catalogue products cannot be modified',
      );
    }
  }

  private assertUniqueSku(sku: string): void {
    if ([...this.products.values()].some((p) => p.sku === sku)) {
      throw new DomainError(409, 'SKU_TAKEN', `SKU ${sku} already exists`);
    }
  }

  // ---------- cart ----------

  private cartFor(userId: string): Map<number, number> {
    let cart = this.carts.get(userId);
    if (!cart) {
      cart = new Map();
      this.carts.set(userId, cart);
    }
    return cart;
  }

  private assertQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new DomainError(
        400,
        'INVALID_QUANTITY',
        `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`,
      );
    }
  }

  addToCart(userId: string, productId: number, quantity: number): void {
    this.assertQuantity(quantity);
    const product = this.getProduct(productId);
    if (!product.inStock)
      throw new DomainError(409, 'OUT_OF_STOCK', `${product.name} is out of stock`);
    const cart = this.cartFor(userId);
    const combined = (cart.get(productId) ?? 0) + quantity;
    if (combined > MAX_QUANTITY_PER_LINE) {
      throw new DomainError(
        400,
        'INVALID_QUANTITY',
        `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`,
      );
    }
    cart.set(productId, combined);
  }

  setCartQuantity(userId: string, productId: number, quantity: number): void {
    this.assertQuantity(quantity);
    const cart = this.cartFor(userId);
    if (!cart.has(productId))
      throw new DomainError(404, 'CART_ITEM_NOT_FOUND', 'Item is not in the cart');
    cart.set(productId, quantity);
  }

  removeFromCart(userId: string, productId: number): void {
    const cart = this.cartFor(userId);
    if (!cart.delete(productId)) {
      throw new DomainError(404, 'CART_ITEM_NOT_FOUND', 'Item is not in the cart');
    }
  }

  clearCart(userId: string): void {
    this.carts.delete(userId);
  }

  cartLines(userId: string): CartLine[] {
    return [...this.cartFor(userId).entries()].map(([productId, quantity]) => {
      const product = this.getProduct(productId);
      return { product, quantity, lineTotalCents: product.priceCents * quantity };
    });
  }

  cartTotals(userId: string): Totals {
    return calculateTotals(
      this.cartLines(userId).map((l) => ({
        unitPriceCents: l.product.priceCents,
        quantity: l.quantity,
      })),
    );
  }

  // ---------- orders ----------

  /**
   * Places an order. An idempotency key makes repeated submissions return the
   * original order instead of creating a duplicate.
   */
  async placeOrder(
    user: User,
    customer: Customer,
    lines: Array<{ productId: number; quantity: number }>,
    idempotencyKey?: string,
  ): Promise<{ order: Order; created: boolean }> {
    const idemKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : undefined;
    if (!idemKey) return this.createOrder(user, customer, lines);
    // Concurrent submissions with the same key (e.g. a double click) share one in-flight write.
    const inFlight = this.pendingOrders.get(idemKey);
    if (inFlight) return { order: (await inFlight).order, created: false };
    const pending = this.createOrder(user, customer, lines, idemKey);
    this.pendingOrders.set(idemKey, pending);
    try {
      return await pending;
    } finally {
      this.pendingOrders.delete(idemKey);
    }
  }

  private async createOrder(
    user: User,
    customer: Customer,
    lines: Array<{ productId: number; quantity: number }>,
    idemKey?: string,
  ): Promise<{ order: Order; created: boolean }> {
    if (idemKey) {
      const existingId = this.idempotency.get(idemKey);
      const existing = existingId ? await this.orders.findById(existingId) : undefined;
      if (existing) return { order: existing, created: false };
    }
    if (lines.length === 0)
      throw new DomainError(400, 'EMPTY_ORDER', 'An order needs at least one item');

    const merged = new Map<number, number>();
    for (const line of lines)
      merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);

    const items: OrderItem[] = [...merged.entries()].map(([productId, quantity]) => {
      this.assertQuantity(quantity);
      const product = this.getProduct(productId);
      if (!product.inStock)
        throw new DomainError(409, 'OUT_OF_STOCK', `${product.name} is out of stock`);
      return {
        productId,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity,
        lineTotalCents: product.priceCents * quantity,
      };
    });
    const totals = calculateTotals(items);
    const order: Order = {
      id: randomUUID(),
      userId: user.id,
      username: user.username,
      customer,
      items,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      shippingCents: totals.shippingCents,
      totalCents: totals.totalCents,
      status: 'PLACED',
      createdAt: new Date().toISOString(),
    };
    await this.orders.save(order);
    if (idemKey) this.idempotency.set(idemKey, order.id);
    return { order, created: true };
  }

  /** Returns the order only when the user owns it (or is an admin). */
  async orderFor(user: User, orderId: string): Promise<Order> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    const order = isUuid ? await this.orders.findById(orderId) : undefined;
    // 404 rather than 403 so order ids of other users cannot be probed.
    if (!order || (order.userId !== user.id && user.role !== 'admin')) {
      throw new DomainError(404, 'ORDER_NOT_FOUND', `Order ${orderId} was not found`);
    }
    return order;
  }

  async cancelOrder(user: User, orderId: string): Promise<Order> {
    const order = await this.orderFor(user, orderId);
    if (order.status !== 'PLACED') {
      throw new DomainError(409, 'INVALID_STATUS_TRANSITION', `Order is already ${order.status}`);
    }
    await this.orders.updateStatus(orderId, 'CANCELLED');
    return { ...order, status: 'CANCELLED' };
  }
}
