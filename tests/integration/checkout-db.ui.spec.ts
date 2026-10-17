import { expect, test } from '../../fixtures/testFixtures';
import { money } from '../../utils/pricing';
import { catalog } from '../../utils/testData';

/** UI -> database integration: what the customer sees is what gets stored. */
test.describe('Checkout persistence (PostgreSQL)', () => {
  test(
    'the order confirmed in the browser is stored with the same details and total',
    { tag: ['@db', '@regression'] },
    async ({ db, signedInCustomer, data, cartPage, checkoutPage, confirmationPage }) => {
      const watch = catalog.byName('Orbit Smartwatch');
      await signedInCustomer.cart.fill([{ productId: watch.id, quantity: 1 }]);
      const shipping = data.customer();

      await cartPage.goto();
      await cartPage.proceedToCheckout();
      await checkoutPage.placeOrder(shipping);
      await expect(confirmationPage.heading).toBeVisible();

      const row = await db.findOrder(confirmationPage.orderIdFromUrl());
      expect(row).toMatchObject({
        email: shipping.email,
        postal_code: shipping.postalCode,
        status: 'PLACED',
      });
      await expect(confirmationPage.total).toHaveText(money((row?.total_cents ?? 0) / 100));
      const items = await db.findOrderItems(confirmationPage.orderIdFromUrl());
      expect(items).toEqual([expect.objectContaining({ product_id: watch.id, quantity: 1 })]);
    },
  );
});
