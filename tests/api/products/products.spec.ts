import { expect, test } from '../../../fixtures/testFixtures';
import { ProductListSchema, ProductSchema } from '../../../api/schemas';
import { expectApiError, expectSchema } from '../../../utils/assertions';
import { env } from '../../../utils/environment';
import { catalog } from '../../../utils/testData';

test.describe('GET /api/products', () => {
  test(
    'returns the catalogue with pagination metadata',
    { tag: ['@smoke', '@regression'] },
    async ({ productsApi }) => {
      const response = await productsApi.list({ limit: 50 });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      const body = expectSchema(ProductListSchema, response.body);
      // Other tests may add temporary products in parallel, so check the seed catalogue is present.
      expect(body.pagination.total).toBeGreaterThanOrEqual(catalog.size);
      for (const expected of catalog.products) {
        expect(body.data).toContainEqual(expect.objectContaining(expected));
      }
      expect(response.durationMs).toBeLessThan(env.apiResponseTimeLimitMs);
    },
  );

  test('pages through results without overlap', { tag: '@regression' }, async ({ productsApi }) => {
    const page1 = expectSchema(
      ProductListSchema,
      (await productsApi.list({ limit: 5, page: 1 })).body,
    );
    const page2 = expectSchema(
      ProductListSchema,
      (await productsApi.list({ limit: 5, page: 2 })).body,
    );

    expect(page1.data).toHaveLength(5);
    expect(page2.data).toHaveLength(5);
    expect(page1.pagination.totalPages).toBe(Math.ceil(page1.pagination.total / 5));
    const ids1 = page1.data.map((p) => p.id);
    expect(page2.data.map((p) => p.id).filter((id) => ids1.includes(id))).toEqual([]);
  });

  test(
    'a page beyond the last returns an empty list, not an error',
    { tag: '@regression' },
    async ({ productsApi }) => {
      const response = await productsApi.list({ limit: 50, page: 999 });

      expect(response.status).toBe(200);
      expect(expectSchema(ProductListSchema, response.body).data).toEqual([]);
    },
  );

  for (const [name, query] of [
    ['limit=0', { limit: 0 }],
    ['limit=51', { limit: 51 }],
    ['page=0', { page: 0 }],
    ['page=-1', { page: -1 }],
    ['limit=abc', { limit: 'abc' }],
    ['unknown sort', { sort: 'popularity' }],
    ['unknown category', { category: 'garden' }],
  ] as const) {
    test(`rejects an invalid query: ${name}`, { tag: '@regression' }, async ({ productsApi }) => {
      expectApiError(
        await productsApi.list(query as Record<string, string | number>),
        400,
        'VALIDATION_ERROR',
      );
    });
  }

  for (const limit of [1, 50]) {
    test(`accepts the boundary limit ${limit}`, { tag: '@regression' }, async ({ productsApi }) => {
      const body = expectSchema(ProductListSchema, (await productsApi.list({ limit })).body);

      expect(body.data).toHaveLength(Math.min(limit, body.pagination.total));
    });
  }

  test('filters by category', { tag: '@regression' }, async ({ productsApi }) => {
    const body = expectSchema(
      ProductListSchema,
      (await productsApi.list({ category: 'wearables', limit: 50 })).body,
    );

    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((p) => p.category === 'wearables')).toBe(true);
  });

  test(
    'searches name, description and SKU case-insensitively',
    { tag: '@regression' },
    async ({ productsApi }) => {
      const byName = expectSchema(
        ProductListSchema,
        (await productsApi.list({ q: 'SMARTWATCH' })).body,
      );
      const bySku = expectSchema(
        ProductListSchema,
        (await productsApi.list({ q: 'hom-002' })).body,
      );

      expect(byName.data.map((p) => p.name)).toEqual(['Orbit Smartwatch']);
      expect(bySku.data.map((p) => p.name)).toEqual(['Haven Coffee Mug']);
    },
  );

  test(
    'sorts by price ascending and descending',
    { tag: '@regression' },
    async ({ productsApi }) => {
      const asc = expectSchema(
        ProductListSchema,
        (await productsApi.list({ sort: 'price_asc', category: 'audio' })).body,
      );
      const desc = expectSchema(
        ProductListSchema,
        (await productsApi.list({ sort: 'price_desc', category: 'audio' })).body,
      );

      const ascPrices = asc.data.map((p) => p.price);
      expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
      expect(desc.data.map((p) => p.id)).toEqual(asc.data.map((p) => p.id).reverse());
    },
  );
});

test.describe('GET /api/products/:id', () => {
  test('returns a single product', { tag: ['@smoke', '@regression'] }, async ({ productsApi }) => {
    const expected = catalog.byName('Volt USB-C Charger');

    const response = await productsApi.get(expected.id);

    expect(response.status).toBe(200);
    expect(expectSchema(ProductSchema, response.body)).toMatchObject(expected);
  });

  test(
    'returns 404 for a product that does not exist',
    { tag: '@regression' },
    async ({ productsApi }) => {
      expectApiError(await productsApi.get(999999), 404, 'PRODUCT_NOT_FOUND');
    },
  );

  for (const id of ['0', '-5', 'abc', '1.5']) {
    test(
      `returns 400 for the invalid id "${id}"`,
      { tag: '@regression' },
      async ({ productsApi }) => {
        expectApiError(await productsApi.get(id), 400, 'VALIDATION_ERROR');
      },
    );
  }

  test('unknown API routes return a JSON 404', { tag: '@regression' }, async ({ api }) => {
    expectApiError(await api.get('/api/does-not-exist'), 404, 'NOT_FOUND');
  });
});
