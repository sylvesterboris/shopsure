import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../fixtures/testFixtures';
import { expectNoA11yViolations } from '../../../utils/assertions';
import { catalog } from '../../../utils/testData';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const scan = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

test.describe('Accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  test(
    'login page, including its error state',
    { tag: ['@a11y', '@regression'] },
    async ({ page, loginPage }) => {
      await loginPage.goto();
      expectNoA11yViolations(await scan(page));

      await loginPage.login({ username: '', password: '' });
      await expect(loginPage.errorMessage).toBeVisible();
      expectNoA11yViolations(await scan(page));
    },
  );

  test(
    'product list and product detail pages',
    { tag: ['@a11y', '@regression'] },
    async ({ page, signedInCustomer: _signedIn, productsPage, productDetailPage }) => {
      await productsPage.goto();
      await productsPage.waitForLoad();
      expectNoA11yViolations(await scan(page));

      await productDetailPage.goto(catalog.byName('Orbit Smartwatch').id);
      expectNoA11yViolations(await scan(page));
    },
  );

  test(
    'cart and checkout with validation errors',
    { tag: ['@a11y', '@regression'] },
    async ({ page, signedInCustomer, cartPage, checkoutPage }) => {
      await signedInCustomer.cart.fill([
        { productId: catalog.byName('Echo Earbuds').id, quantity: 2 },
      ]);
      await cartPage.goto();
      expectNoA11yViolations(await scan(page));

      await checkoutPage.goto();
      await checkoutPage.placeOrderButton.click();
      await expect(checkoutPage.errorSummary).toBeVisible();
      expectNoA11yViolations(await scan(page));
    },
  );
});
