import { expect, test } from '../../../fixtures/testFixtures';
import { OrderListSchema, OrderSchema } from '../../../api/schemas';
import { expectSchema } from '../../../utils/assertions';
import { accounts } from '../../../utils/environment';
import { expectedTotals, money } from '../../../utils/pricing';
import { catalog } from '../../../utils/testData';
import type { CustomerData } from '../../../utils/testDataFactory';

const headphones = catalog.byName('Aurora Wireless Headphones');
const mug = catalog.byName('Haven Coffee Mug');

test.describe('Checkout', () => {
  test(
    'customer completes the full journey from login to order confirmation',
    { tag: ['@smoke', '@regression'] },
    async ({
      page,
      customer,
      data,
      loginPage,
      productsPage,
      cartPage,
      checkoutPage,
      confirmationPage,
    }) => {
      // Arrange
      const shipping = data.customer();
      await loginPage.goto();
      await loginPage.login(customer.credentials);

      // Act
      await productsPage.search('mug');
      await productsPage.addToCart(mug.name);
      await expect(productsPage.header.cartCount).toHaveText('1');
      await productsPage.header.openCart();
      await cartPage.proceedToCheckout();
      await checkoutPage.placeOrder(shipping);

      // Assert
      await expect(confirmationPage.heading).toBeVisible();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
      await expect(confirmationPage.orderNumber).toHaveText(confirmationPage.orderIdFromUrl());
      await expect(confirmationPage.items).toHaveCount(1);
      await expect(confirmationPage.total).toHaveText(
        money(expectedTotals([{ unitPrice: mug.price, quantity: 1 }]).total),
      );
      await expect(confirmationPage.header.cartCount).toHaveText('0');
    },
  );

  test(
    'confirmation shows the ordered items and totals, matching the API record',
    { tag: ['@smoke', '@regression'] },
    async ({ signedInCustomer, data, cartPage, checkoutPage, confirmationPage }) => {
      const lines = [
        { product: headphones, quantity: 1 },
        { product: mug, quantity: 2 },
      ];
      await signedInCustomer.cart.fill(
        lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      );
      const expected = expectedTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity })),
      );
      const shipping = data.customer();

      await cartPage.goto();
      await cartPage.proceedToCheckout();
      await expect(checkoutPage.total).toHaveText(money(expected.total));
      await checkoutPage.placeOrder(shipping);

      await expect(confirmationPage.heading).toBeVisible();
      await expect(confirmationPage.status).toHaveText('Status: PLACED');
      await expect(confirmationPage.customer).toHaveText(
        `Shipping to ${shipping.firstName} ${shipping.lastName}, ${shipping.postalCode}`,
      );
      await expect(confirmationPage.items).toHaveCount(lines.length);
      await expect(confirmationPage.subtotal).toHaveText(money(expected.subtotal));
      await expect(confirmationPage.tax).toHaveText(money(expected.tax));
      await expect(confirmationPage.total).toHaveText(money(expected.total));

      const apiOrder = expectSchema(
        OrderSchema,
        (await signedInCustomer.orders.get(confirmationPage.orderIdFromUrl())).body,
      );
      expect(apiOrder.total).toBe(expected.total);
      expect(apiOrder.customer.email).toBe(shipping.email);
    },
  );

  test(
    'submitting an empty form shows a message for every required field',
    { tag: '@regression' },
    async ({ page, signedInCustomer, checkoutPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      await checkoutPage.goto();

      await checkoutPage.placeOrderButton.click();

      await expect(page).toHaveURL(/\/checkout$/);
      await expect(checkoutPage.errorSummary).toHaveText('Please correct the highlighted fields.');
      await expect(checkoutPage.fieldError('firstName')).toHaveText('First name is required');
      await expect(checkoutPage.fieldError('lastName')).toHaveText('Last name is required');
      await expect(checkoutPage.fieldError('email')).toHaveText('Email is required');
      await expect(checkoutPage.fieldError('postalCode')).toHaveText('Postal code is required');
      await expect(checkoutPage.firstName).toHaveAttribute('aria-invalid', 'true');
    },
  );

  const invalidDetails: Array<{
    name: string;
    field: keyof CustomerData;
    value: string;
    message: string;
  }> = [
    {
      name: 'email without @',
      field: 'email',
      value: 'asha.example.com',
      message: 'Enter a valid email address',
    },
    {
      name: 'email without domain suffix',
      field: 'email',
      value: 'asha@example',
      message: 'Enter a valid email address',
    },
    {
      name: 'postal code with 5 digits',
      field: 'postalCode',
      value: '11000',
      message: 'Postal code must be exactly 6 digits',
    },
    {
      name: 'postal code with 7 digits',
      field: 'postalCode',
      value: '1100011',
      message: 'Postal code must be exactly 6 digits',
    },
    {
      name: 'postal code with letters',
      field: 'postalCode',
      value: '11OO01',
      message: 'Postal code must be exactly 6 digits',
    },
    {
      name: 'first name with digits',
      field: 'firstName',
      value: 'Asha2',
      message: 'First name may only contain letters, spaces, apostrophes and hyphens',
    },
    {
      name: 'first name of only spaces',
      field: 'firstName',
      value: '   ',
      message: 'First name is required',
    },
    {
      name: 'last name over 50 characters',
      field: 'lastName',
      value: 'L'.repeat(51),
      message: 'Last name must be at most 50 characters',
    },
  ];

  for (const scenario of invalidDetails) {
    test(
      `rejects invalid customer details: ${scenario.name}`,
      { tag: '@regression' },
      async ({ signedInCustomer, data, checkoutPage }) => {
        await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
        const details = data.customer({ [scenario.field]: scenario.value });
        await checkoutPage.goto();

        await checkoutPage.placeOrder(details);

        await expect(checkoutPage.fieldError(scenario.field)).toHaveText(scenario.message);
        // Only the invalid field is flagged, and the user's input is preserved.
        await expect(checkoutPage.fieldErrors).toHaveCount(1);
        await expect(checkoutPage.email).toHaveValue(details.email);
        expect(
          expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total,
        ).toBe(0);
      },
    );
  }

  test(
    'accepts boundary-length names of 1 and 50 characters',
    { tag: '@regression' },
    async ({ signedInCustomer, data, checkoutPage, confirmationPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      await checkoutPage.goto();

      await checkoutPage.placeOrder(data.customer({ firstName: 'A', lastName: 'B'.repeat(50) }));

      await expect(confirmationPage.heading).toBeVisible();
    },
  );

  test(
    'going back after ordering lands on the empty cart instead of a re-submittable form',
    { tag: '@regression' },
    async ({ page, signedInCustomer, data, checkoutPage, confirmationPage, cartPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      await checkoutPage.goto();
      await checkoutPage.placeOrder(data.customer());
      await expect(confirmationPage.heading).toBeVisible();

      await page.goBack();

      await expect(page).toHaveURL(/\/cart$/);
      await expect(cartPage.emptyMessage).toBeVisible();
      expect(expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total).toBe(
        1,
      );
    },
  );

  test(
    're-posting an already used checkout form returns the original order',
    { tag: '@regression' },
    async ({ page, signedInCustomer, data, checkoutPage, confirmationPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      const shipping = data.customer();
      await checkoutPage.goto();
      const token = await checkoutPage.checkoutToken();
      await checkoutPage.placeOrder(shipping);
      await expect(confirmationPage.heading).toBeVisible();
      const firstOrderId = confirmationPage.orderIdFromUrl();

      // Same form, same token, e.g. a browser "resubmit form?" prompt or a replayed request.
      const replay = await page.request.post('/checkout', {
        form: { ...shipping, checkoutToken: token },
        maxRedirects: 0,
      });

      expect(replay.status()).toBe(303);
      expect(replay.headers().location).toBe(`/orders/${firstOrderId}`);
      expect(expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total).toBe(
        1,
      );
    },
  );

  test(
    'two simultaneous submissions of one checkout form create a single order',
    { tag: '@regression' },
    async ({ page, signedInCustomer, data, checkoutPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      await checkoutPage.goto();
      const token = await checkoutPage.checkoutToken();
      const form = { ...data.customer(), checkoutToken: token };

      // page.request shares the browser's session cookie, simulating a double click
      // that bypasses the client-side button disabling.
      const [first, second] = await Promise.all([
        page.request.post('/checkout', { form, maxRedirects: 0 }),
        page.request.post('/checkout', { form, maxRedirects: 0 }),
      ]);

      expect(first.status()).toBe(303);
      expect(second.status()).toBe(303);
      expect(first.headers().location).toBe(second.headers().location);
      expect(expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total).toBe(
        1,
      );
    },
  );

  test(
    'the place-order button is disabled once the form is submitted',
    { tag: '@regression' },
    async ({ page, signedInCustomer, data, checkoutPage }) => {
      await signedInCustomer.cart.fill([{ productId: mug.id, quantity: 1 }]);
      await checkoutPage.goto();
      await checkoutPage.fillShippingDetails(data.customer());
      // Cancel the navigation so the in-flight UI state can be inspected. (Locators wait for
      // pending navigations, so holding the request with page.route would hide this state.)
      await page.getByTestId('checkout-form').evaluate((form) => {
        form.addEventListener('submit', (e) => e.preventDefault());
      });

      await checkoutPage.placeOrderButton.click();

      await expect(page.getByRole('button', { name: 'Placing order…' })).toBeDisabled();
      await expect(checkoutPage.placeOrderButton).toHaveCount(0);
      expect(expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total).toBe(
        0,
      );
    },
  );

  test(
    'refreshing mid-checkout keeps the cart, and refreshing the confirmation does not reorder',
    { tag: '@regression' },
    async ({ page, signedInCustomer, data, checkoutPage, confirmationPage }) => {
      await signedInCustomer.cart.fill([{ productId: headphones.id, quantity: 1 }]);
      await checkoutPage.goto();
      await checkoutPage.fillShippingDetails({ firstName: 'Asha' });

      await page.reload();
      await expect(checkoutPage.total).toHaveText(
        money(expectedTotals([{ unitPrice: headphones.price, quantity: 1 }]).total),
      );
      await checkoutPage.placeOrder(data.customer());
      await expect(confirmationPage.heading).toBeVisible();
      await page.reload();

      await expect(confirmationPage.heading).toBeVisible();
      expect(expectSchema(OrderListSchema, (await signedInCustomer.orders.list()).body).total).toBe(
        1,
      );
    },
  );

  test(
    "a customer cannot open another customer's order confirmation",
    { tag: '@regression' },
    async ({ page, customer, data, loginPage, confirmationPage }) => {
      // Arrange: the order belongs to `customer`; the browser signs in as the seeded standard user.
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: mug.id, quantity: 1 }],
      });
      await loginPage.goto();
      await loginPage.login(accounts.standard());

      // Act
      const response = await page.goto(`/orders/${order.id}`);

      // Assert
      expect(response?.status()).toBe(404);
      await expect(confirmationPage.notFoundHeading).toBeVisible();
    },
  );
});
