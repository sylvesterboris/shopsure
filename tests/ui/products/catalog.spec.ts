import { expect, test } from '../../../fixtures/testFixtures';
import { money } from '../../../utils/pricing';
import { catalog } from '../../../utils/testData';

test.describe('Product catalogue', () => {
  test.beforeEach(async ({ signedInCustomer: _signedIn, productsPage }) => {
    await productsPage.goto();
    await productsPage.waitForLoad();
  });

  test('lists the full catalogue', { tag: ['@smoke', '@regression'] }, async ({ productsPage }) => {
    await expect(productsPage.resultsCount).toHaveText(`${catalog.size} products`);
    await expect(productsPage.productCards).toHaveCount(catalog.size);
  });

  test(
    'shows the expected name and price for every product',
    { tag: '@regression' },
    async ({ productsPage }) => {
      for (const product of catalog.products) {
        await expect(productsPage.card(product.name).getByTestId('product-price')).toHaveText(
          money(product.price),
        );
      }
    },
  );

  test(
    'search finds a product by part of its name, ignoring case',
    { tag: ['@smoke', '@regression'] },
    async ({ productsPage }) => {
      await productsPage.search('AURORA');

      await expect(productsPage.resultsCount).toHaveText('1 product');
      await expect(productsPage.productCards.getByRole('heading')).toHaveText([
        'Aurora Wireless Headphones',
      ]);
    },
  );

  test(
    'search with no matches shows an empty state',
    { tag: '@regression' },
    async ({ productsPage }) => {
      await productsPage.search('no-such-product-xyz');

      await expect(productsPage.resultsCount).toHaveText('0 products');
      await expect(productsPage.emptyState).toBeVisible();
      await expect(productsPage.productCards).toHaveCount(0);
    },
  );

  test(
    'category filter shows only products from that category',
    { tag: '@regression' },
    async ({ productsPage }) => {
      const expected = catalog.products.filter((p) => p.category === 'home').map((p) => p.name);

      await productsPage.filterByCategory('Home');

      await expect(productsPage.productCards.getByRole('heading')).toHaveText(expected);
    },
  );

  test(
    'sorting by price low to high orders prices ascending',
    { tag: '@regression' },
    async ({ productsPage }) => {
      await productsPage.sortBy('Price: low to high');

      const prices = await productsPage.productPrices();
      expect(prices).toHaveLength(catalog.size);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    },
  );

  test(
    'sorting by price high to low orders prices descending',
    { tag: '@regression' },
    async ({ productsPage }) => {
      await productsPage.sortBy('Price: high to low');

      const prices = await productsPage.productPrices();
      expect(prices[0]).toBe(Math.max(...catalog.products.map((p) => p.price)));
      expect(prices).toEqual([...prices].sort((a, b) => b - a));
    },
  );

  test(
    'sorting by name A to Z orders names alphabetically',
    { tag: '@regression' },
    async ({ productsPage }) => {
      const expected = catalog.products.map((p) => p.name).sort((a, b) => a.localeCompare(b));

      await productsPage.sortBy('Name: A to Z');

      await expect(productsPage.productCards.getByRole('heading')).toHaveText(expected);
    },
  );

  test(
    'filters, search and sort combine and survive a page refresh',
    { tag: '@regression' },
    async ({ page, productsPage }) => {
      await productsPage.filterByCategory('Accessories');
      await productsPage.sortBy('Price: high to low');
      const before = await productsPage.productNames();

      await page.reload();
      await productsPage.waitForLoad();

      await expect(productsPage.categorySelect).toHaveValue('accessories');
      await expect(productsPage.sortSelect).toHaveValue('price_desc');
      await expect(productsPage.productCards.getByRole('heading')).toHaveText(before);
    },
  );

  test(
    'opening a product shows its details',
    { tag: ['@smoke', '@regression'] },
    async ({ page, productsPage, productDetailPage }) => {
      const product = catalog.byName('Lumen Desk Lamp');

      await productsPage.openProduct(product.name);

      await expect(page).toHaveURL(`/products/${product.id}`);
      await expect(productDetailPage.name).toHaveText(product.name);
      await expect(productDetailPage.price).toHaveText(money(product.price));
      await expect(productDetailPage.category).toHaveText('Category: Home');
    },
  );

  test(
    'out-of-stock products cannot be added to the cart',
    { tag: '@regression' },
    async ({ productsPage, productDetailPage }) => {
      const product = catalog.byName('Zen Aroma Diffuser');
      expect(product.inStock, 'precondition: test data marks this product out of stock').toBe(
        false,
      );

      await expect(
        productsPage.card(product.name).getByRole('button', { name: 'Out of stock' }),
      ).toBeDisabled();

      await productDetailPage.goto(product.id);
      await expect(productDetailPage.outOfStock).toBeVisible();
      await expect(productDetailPage.addToCartButton).toHaveCount(0);
    },
  );
});

test.describe('Products that do not exist', () => {
  for (const id of ['9999', '0', 'abc']) {
    test(
      `product page for id "${id}" shows a not-found message`,
      { tag: '@regression' },
      async ({ signedInCustomer: _signedIn, page, productDetailPage }) => {
        const response = await page.goto(`/products/${id}`);

        expect(response?.status()).toBe(404);
        await expect(productDetailPage.notFoundHeading).toBeVisible();
      },
    );
  }
});
