import { expect, test } from '../../../fixtures/testFixtures';
import { ProductSchema } from '../../../api/schemas';
import { expectApiError, expectSchema } from '../../../utils/assertions';
import { catalog } from '../../../utils/testData';

test.describe('Product management (admin only)', () => {
  test(
    'POST creates a product and returns its location',
    { tag: ['@smoke', '@regression'] },
    async ({ admin, data }) => {
      const input = data.productInput({ price: 19.99 });

      const response = await admin.products.create(input);

      expect(response.status).toBe(201);
      const product = expectSchema(ProductSchema, response.body);
      expect(response.headers.location).toBe(`/api/products/${product.id}`);
      expect(product).toMatchObject({ ...input, currency: 'USD' });
      // Cleanup: this test creates the product directly, so it removes it too.
      expect((await admin.products.remove(product.id)).status).toBe(204);
    },
  );

  test(
    'PUT replaces every field of a product',
    { tag: '@regression' },
    async ({ admin, data, createTempProduct, productsApi }) => {
      const product = await createTempProduct();
      const replacement = data.productInput({ category: 'home', price: 5, inStock: false });

      const response = await admin.products.replace(product.id, replacement);

      expect(response.status).toBe(200);
      expect(expectSchema(ProductSchema, response.body)).toMatchObject({
        id: product.id,
        ...replacement,
      });
      expect(expectSchema(ProductSchema, (await productsApi.get(product.id)).body).price).toBe(5);
    },
  );

  // Regression test for BUG-002 (docs/bug-reports/BUG-002-patch-resets-fields.md).
  test(
    'PATCH changes only the given fields and preserves all others',
    { tag: '@regression' },
    async ({ admin, createTempProduct, productsApi }) => {
      const product = await createTempProduct({ description: 'Keep me', inStock: false });

      const response = await admin.products.update(product.id, { price: 42.5 });

      expect(response.status).toBe(200);
      const expected = { ...product, price: 42.5 };
      expect(expectSchema(ProductSchema, response.body)).toEqual(expected);
      expect(expectSchema(ProductSchema, (await productsApi.get(product.id)).body)).toEqual(
        expected,
      );
    },
  );

  test(
    'DELETE removes the product',
    { tag: '@regression' },
    async ({ admin, createTempProduct, productsApi }) => {
      const product = await createTempProduct();

      expect((await admin.products.remove(product.id)).status).toBe(204);
      expectApiError(await productsApi.get(product.id), 404, 'PRODUCT_NOT_FOUND');
      expectApiError(await admin.products.remove(product.id), 404, 'PRODUCT_NOT_FOUND');
    },
  );

  test('seed catalogue products are read-only', { tag: '@regression' }, async ({ admin }) => {
    const seed = catalog.byName('Aurora Wireless Headphones');

    expectApiError(
      await admin.products.update(seed.id, { price: 1 }),
      403,
      'SEED_PRODUCT_READ_ONLY',
    );
    expectApiError(await admin.products.remove(seed.id), 403, 'SEED_PRODUCT_READ_ONLY');
  });

  test('a duplicate SKU is rejected with 409', { tag: '@regression' }, async ({ admin, data }) => {
    expectApiError(
      await admin.products.create(data.productInput({ sku: 'AUD-001' })),
      409,
      'SKU_TAKEN',
    );
  });

  test.describe('authorization', () => {
    test(
      'anonymous callers get 401 for every write method',
      { tag: '@regression' },
      async ({ productsApi, data, createTempProduct }) => {
        const product = await createTempProduct();

        expectApiError(await productsApi.create(data.productInput()), 401, 'UNAUTHENTICATED');
        expectApiError(
          await productsApi.replace(product.id, data.productInput()),
          401,
          'UNAUTHENTICATED',
        );
        expectApiError(await productsApi.update(product.id, { price: 1 }), 401, 'UNAUTHENTICATED');
        expectApiError(await productsApi.remove(product.id), 401, 'UNAUTHENTICATED');
      },
    );

    test(
      'customers get 403 for every write method',
      { tag: '@regression' },
      async ({ customer, data, createTempProduct }) => {
        const product = await createTempProduct();

        expectApiError(await customer.products.create(data.productInput()), 403, 'FORBIDDEN');
        expectApiError(
          await customer.products.replace(product.id, data.productInput()),
          403,
          'FORBIDDEN',
        );
        expectApiError(await customer.products.update(product.id, { price: 1 }), 403, 'FORBIDDEN');
        expectApiError(await customer.products.remove(product.id), 403, 'FORBIDDEN');
      },
    );
  });

  test.describe('payload validation', () => {
    const accepted: Array<[string, Record<string, unknown>]> = [
      ['price 0.01 (minimum)', { price: 0.01 }],
      ['price 10000 (maximum)', { price: 10000 }],
      ['name of 80 characters', { name: 'N'.repeat(80) }],
    ];
    const rejected: Array<[string, Record<string, unknown>]> = [
      ['price 0.00', { price: 0 }],
      ['price 10000.01', { price: 10000.01 }],
      ['negative price', { price: -1 }],
      ['price with 3 decimals', { price: 1.234 }],
      ['price as a string', { price: '9.99' }],
      ['lowercase SKU', { sku: 'abc-123' }],
      ['unknown category', { category: 'garden' }],
      ['empty name', { name: '   ' }],
      ['name of 81 characters', { name: 'N'.repeat(81) }],
    ];

    for (const [name, override] of accepted) {
      test(`accepts ${name}`, { tag: '@regression' }, async ({ admin, data }) => {
        const response = await admin.products.create({ ...data.productInput(), ...override });

        expect(response.status).toBe(201);
        expect(
          (await admin.products.remove(expectSchema(ProductSchema, response.body).id)).status,
        ).toBe(204);
      });
    }

    for (const [name, override] of rejected) {
      test(`rejects ${name}`, { tag: '@regression' }, async ({ admin, data }) => {
        expectApiError(
          await admin.products.create({ ...data.productInput(), ...override }),
          400,
          'VALIDATION_ERROR',
        );
      });
    }

    test('missing required fields are each reported', { tag: '@regression' }, async ({ admin }) => {
      const response = await admin.products.create({ description: 'only a description' });

      expectApiError(response, 400, 'VALIDATION_ERROR');
      const fields = (
        response.body as { error: { details: Array<{ field: string }> } }
      ).error.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['sku', 'name', 'category', 'price']));
    });

    test(
      'PATCH with an empty body or unknown fields is rejected',
      { tag: '@regression' },
      async ({ admin, createTempProduct }) => {
        const product = await createTempProduct();

        expectApiError(await admin.products.update(product.id, {}), 400, 'VALIDATION_ERROR');
        expectApiError(
          await admin.products.update(product.id, { colour: 'red' }),
          400,
          'VALIDATION_ERROR',
        );
      },
    );
  });
});
