import { test as base, expect } from '@playwright/test';
import { ApiClient } from '../api/ApiClient';
import { AuthApi } from '../api/AuthApi';
import { CartApi } from '../api/CartApi';
import { OrdersApi } from '../api/OrdersApi';
import { ProductsApi } from '../api/ProductsApi';
import { HealthSchema, type Product, type User } from '../api/schemas';
import { DatabaseClient } from '../database/DatabaseClient';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { LoginPage } from '../pages/LoginPage';
import { OrderConfirmationPage } from '../pages/OrderConfirmationPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { ProductsPage } from '../pages/ProductsPage';
import { expectSchema } from '../utils/assertions';
import { accounts, env, type Credentials } from '../utils/environment';
import { TestDataFactory, type ProductInputData } from '../utils/testDataFactory';

export const SESSION_COOKIE = 'shopsure_session';

/** An authenticated API user with service clients bound to their token. */
export interface ApiUser {
  credentials: Credentials;
  user: User;
  token: string;
  auth: AuthApi;
  products: ProductsApi;
  cart: CartApi;
  orders: OrdersApi;
}

interface TestFixtures {
  /** Seeded (or reproducible via TEST_DATA_SEED) data for this test. */
  data: TestDataFactory;
  /** Unauthenticated API client; its redacted request log is attached when a test fails. */
  api: ApiClient;
  authApi: AuthApi;
  productsApi: ProductsApi;
  /** A brand-new customer account, so every test has its own empty cart and orders. */
  customer: ApiUser;
  /** The seeded administrator account. */
  admin: ApiUser;
  /** Creates catalogue products that are deleted again after the test. */
  createTempProduct: (overrides?: Partial<ProductInputData>) => Promise<Product>;
  /** Signs the browser in as `customer` via a session cookie (no UI login, no stored state file). */
  signedInCustomer: ApiUser;
  /** Database access; the test is skipped when DATABASE_URL is not configured. */
  db: DatabaseClient;

  loginPage: LoginPage;
  productsPage: ProductsPage;
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  confirmationPage: OrderConfirmationPage;
}

interface WorkerFixtures {
  dbConnection: DatabaseClient | undefined;
}

function apiUser(api: ApiClient, credentials: Credentials, token: string, user: User): ApiUser {
  const client = api.withToken(token);
  return {
    credentials,
    user,
    token,
    auth: new AuthApi(client),
    products: new ProductsApi(client),
    cart: new CartApi(client),
    orders: new OrdersApi(client),
  };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Playwright requires object destructuring for fixture parameters, even when empty.
  // eslint-disable-next-line no-empty-pattern
  data: async ({}, use, testInfo) => {
    const factory = new TestDataFactory(
      `${testInfo.titlePath.join('>')}#${testInfo.repeatEachIndex}`,
      testInfo.workerIndex,
    );
    await use(factory);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('test-data-seed', {
        body: `TEST_DATA_SEED=${factory.seed}`,
        contentType: 'text/plain',
      });
    }
  },

  api: async ({ request }, use, testInfo) => {
    const client = new ApiClient(request);
    await use(client);
    if (testInfo.status !== testInfo.expectedStatus && client.history.length > 0) {
      await testInfo.attach('api-exchanges.json', {
        body: JSON.stringify(client.history, null, 2),
        contentType: 'application/json',
      });
    }
  },

  authApi: async ({ api }, use) => {
    await use(new AuthApi(api));
  },

  productsApi: async ({ api }, use) => {
    await use(new ProductsApi(api));
  },

  customer: async ({ api, authApi, data, dbConnection }, use) => {
    const newUser = data.newUser();
    await authApi.registerUser(newUser);
    const credentials = { username: newUser.username, password: newUser.password };
    const session = await authApi.authenticate(credentials);
    await use(apiUser(api, credentials, session.token, session.user));
    // Teardown: when orders are persisted, remove the ones this throwaway user created.
    // (Users, carts and sessions live in the demo server's memory and vanish on restart.)
    await dbConnection?.deleteOrdersForUsername(newUser.username);
  },

  admin: async ({ api, authApi }, use) => {
    const credentials = accounts.admin();
    const session = await authApi.authenticate(credentials);
    await use(apiUser(api, credentials, session.token, session.user));
  },

  createTempProduct: async ({ admin, data }, use) => {
    const created: number[] = [];
    await use(async (overrides) => {
      const product = await admin.products.createProduct(data.productInput(overrides));
      created.push(product.id);
      return product;
    });
    for (const id of created) {
      const response = await admin.products.remove(id);
      // 404 is fine: the test itself may have deleted the product.
      expect([204, 404], `cleanup of product ${id}`).toContain(response.status);
    }
  },

  signedInCustomer: async ({ customer, context, baseURL }, use) => {
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: customer.token,
        url: baseURL ?? env.baseUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await use(customer);
  },

  dbConnection: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const client = env.databaseUrl ? new DatabaseClient(env.databaseUrl) : undefined;
      await use(client);
      await client?.close();
    },
    { scope: 'worker' },
  ],

  db: async ({ dbConnection, api }, use) => {
    test.skip(
      dbConnection === undefined,
      'DATABASE_URL is not set: database validation is optional (see README > Optional database setup).',
    );
    // The tests and the app must use the same database, otherwise every check is meaningless.
    const health = expectSchema(HealthSchema, (await api.get('/health')).body, 'health');
    test.skip(
      health.storage !== 'postgres',
      'The application under test is not storing orders in Postgres (start it with DATABASE_URL set).',
    );
    await use(dbConnection as DatabaseClient);
  },

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  productsPage: async ({ page }, use) => use(new ProductsPage(page)),
  productDetailPage: async ({ page }, use) => use(new ProductDetailPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  confirmationPage: async ({ page }, use) => use(new OrderConfirmationPage(page)),
});

export { expect };
