import { expect, test } from '../../../fixtures/testFixtures';
import { catalog } from '../../../utils/testData';

/**
 * Visual regression for a few stable components. Baselines are platform-specific
 * (font rendering differs), so these run on Chromium only and are excluded from the
 * default CI regression job. Regenerate with: npm run test:update-snapshots
 */
test.describe('Visual regression', () => {
  test('login form', { tag: '@visual' }, async ({ page, loginPage }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginPage.goto();

    await expect(page.locator('main')).toHaveScreenshot('login-form.png');
  });

  test(
    'product detail card',
    { tag: '@visual' },
    async ({ page, signedInCustomer: _signedIn, productDetailPage }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await productDetailPage.goto(catalog.byName('Aurora Wireless Headphones').id);

      await expect(page.getByTestId('product-detail')).toHaveScreenshot('product-detail.png');
    },
  );

  test(
    'checkout validation errors',
    { tag: '@visual' },
    async ({ page, signedInCustomer, checkoutPage }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await signedInCustomer.cart.fill([
        { productId: catalog.byName('Haven Coffee Mug').id, quantity: 1 },
      ]);
      await checkoutPage.goto();
      await checkoutPage.placeOrderButton.click();

      await expect(page.getByTestId('checkout-form')).toHaveScreenshot('checkout-errors.png');
    },
  );
});
