import { expect, test } from '../../../fixtures/testFixtures';

/**
 * Request interception lets us test UI states that are hard to trigger against a
 * healthy backend: server errors, network failures, malformed and empty responses.
 */
test.describe('Product list resilience (mocked network)', () => {
  test(
    'shows an error and recovers via Retry when the products API returns 500',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await page.route('**/api/products?*', (route) =>
        route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
        }),
      );
      await productsPage.goto();
      await expect(productsPage.loadError).toBeVisible();

      await page.unroute('**/api/products?*');
      await productsPage.retryButton.click();

      await expect(productsPage.loadError).toBeHidden();
      await expect(productsPage.productCards).not.toHaveCount(0);
    },
  );

  test(
    'shows an error when the network request fails',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await page.route('**/api/products?*', (route) => route.abort('internetdisconnected'));

      await productsPage.goto();

      await expect(productsPage.loadError).toBeVisible();
      await expect(productsPage.productCards).toHaveCount(0);
    },
  );

  test(
    'shows an error instead of crashing on a malformed response body',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await page.route('**/api/products?*', (route) =>
        route.fulfill({ status: 200, json: { unexpected: true } }),
      );

      await productsPage.goto();

      await expect(productsPage.loadError).toBeVisible();
    },
  );

  test(
    'renders the empty state for an empty result set',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await page.route('**/api/products?*', (route) =>
        route.fulfill({
          json: { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } },
        }),
      );

      await productsPage.goto();

      await expect(productsPage.emptyState).toBeVisible();
      await expect(productsPage.resultsCount).toHaveText('0 products');
    },
  );

  test(
    'renders whatever the API returns, including unusual prices',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await page.route('**/api/products?*', (route) =>
        route.fulfill({
          json: {
            data: [
              {
                id: 501,
                sku: 'TST-501',
                name: 'Mocked Penny Item',
                description: '',
                category: 'home',
                price: 0.01,
                currency: 'USD',
                inStock: true,
              },
              {
                id: 502,
                sku: 'TST-502',
                name: 'Mocked Max Price Item',
                description: '',
                category: 'home',
                price: 10000,
                currency: 'USD',
                inStock: true,
              },
            ],
            pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
          },
        }),
      );

      await productsPage.goto();

      await expect(productsPage.card('Mocked Penny Item').getByTestId('product-price')).toHaveText(
        '$0.01',
      );
      await expect(
        productsPage.card('Mocked Max Price Item').getByTestId('product-price'),
      ).toHaveText('$10000.00');
    },
  );

  test(
    'tells the user when adding to cart fails because the network is down',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, page, productsPage }) => {
      await productsPage.goto();
      await productsPage.waitForLoad();
      await page.route('**/api/cart/items', (route) => route.abort('failed'));

      await productsPage.addToCart('Echo Earbuds');

      await expect(productsPage.toast).toHaveText('Network error. Please try again.');
      await expect(productsPage.header.cartCount).toHaveText('0');
    },
  );
});
