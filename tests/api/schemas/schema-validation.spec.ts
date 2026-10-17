import { expect, test } from '../../../fixtures/testFixtures';
import {
  ErrorSchema,
  HealthSchema,
  OrderSchema,
  ProductSchema,
  UserSchema,
} from '../../../api/schemas';
import { expectSchema } from '../../../utils/assertions';

/**
 * The schemas are only useful if they actually reject bad data. These tests feed them
 * deliberately broken payloads and check that the failure messages point at the problem.
 */
const validProduct = {
  id: 1,
  sku: 'AUD-001',
  name: 'Aurora Wireless Headphones',
  description: 'Over-ear headphones.',
  category: 'audio',
  price: 89.99,
  currency: 'USD',
  inStock: true,
};

const validOrder = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  status: 'PLACED',
  customer: {
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@example.test',
    postalCode: '110001',
  },
  items: [
    {
      productId: 1,
      name: 'Aurora Wireless Headphones',
      unitPrice: 89.99,
      quantity: 1,
      lineTotal: 89.99,
    },
  ],
  subtotal: 89.99,
  tax: 7.2,
  shipping: 0,
  total: 97.19,
  currency: 'USD',
  createdAt: '2026-10-17T08:00:00.000Z',
};

const failureOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected schema validation to fail');
};

test.describe('Schema validation behaviour', () => {
  test('valid payloads pass and are returned typed', { tag: '@regression' }, () => {
    expect(expectSchema(ProductSchema, validProduct).price).toBe(89.99);
    expect(expectSchema(OrderSchema, validOrder).items).toHaveLength(1);
  });

  test('a missing required property is reported by name', { tag: '@regression' }, () => {
    const { price: _price, ...withoutPrice } = validProduct;

    const message = failureOf(() => expectSchema(ProductSchema, withoutPrice, 'product'));

    expect(message).toContain('product does not match schema');
    expect(message).toMatch(/at price/);
  });

  test(
    'a wrong data type is rejected with the expected and received types',
    { tag: '@regression' },
    () => {
      const message = failureOf(() =>
        expectSchema(ProductSchema, { ...validProduct, price: '89.99' }),
      );

      expect(message).toMatch(/expected number, received string/);
      expect(message).toMatch(/at price/);
    },
  );

  test('unexpected extra properties are rejected (strict contract)', { tag: '@regression' }, () => {
    const message = failureOf(() =>
      expectSchema(UserSchema, {
        id: '3b241101-e2bb-4255-8caf-4136c566a962',
        username: 'qa',
        displayName: 'QA',
        role: 'customer',
        passwordHash: 'leaked',
      }),
    );

    expect(message).toMatch(/passwordHash/);
  });

  test('nested violations report their full path', { tag: '@regression' }, () => {
    const broken = { ...validOrder, items: [{ ...validOrder.items[0], quantity: 0 }] };

    expect(failureOf(() => expectSchema(OrderSchema, broken))).toMatch(/at items\[0\]\.quantity/);
  });

  test('invalid enum values and formats are rejected', { tag: '@regression' }, () => {
    expect(() => expectSchema(OrderSchema, { ...validOrder, status: 'SHIPPED' })).toThrow(/status/);
    expect(() => expectSchema(OrderSchema, { ...validOrder, id: 'not-a-uuid' })).toThrow(/id/);
    expect(() => expectSchema(OrderSchema, { ...validOrder, createdAt: '17/10/2026' })).toThrow(
      /createdAt/,
    );
    expect(() => expectSchema(ProductSchema, { ...validProduct, price: 1.005 })).toThrow(/price/);
    expect(() => expectSchema(ErrorSchema, { error: { code: 'lowercase', message: 'x' } })).toThrow(
      /code/,
    );
  });

  test('an order with no items is rejected', { tag: '@regression' }, () => {
    expect(() => expectSchema(OrderSchema, { ...validOrder, items: [] })).toThrow(/items/);
  });
});

test.describe('Live contract checks', () => {
  test(
    'health endpoint matches its contract',
    { tag: ['@smoke', '@regression'] },
    async ({ api }) => {
      const response = await api.get('/health');

      expect(response.status).toBe(200);
      expectSchema(HealthSchema, response.body);
    },
  );

  test('every error response shares the same envelope', { tag: '@regression' }, async ({ api }) => {
    const responses = await Promise.all([
      api.get('/api/products/999999'),
      api.get('/api/products?limit=0'),
      api.get('/api/cart'),
      api.post('/api/auth/login', { rawBody: '{oops', token: null }),
      api.get('/api/nope'),
    ]);

    for (const response of responses) {
      expect(response.headers['content-type']).toContain('application/json');
      expectSchema(ErrorSchema, response.body, `${response.status} error body`);
    }
  });
});
