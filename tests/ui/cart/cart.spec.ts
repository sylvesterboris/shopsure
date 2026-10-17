import { SESSION_COOKIE, expect, test } from '../../../fixtures/testFixtures';
import { CartPage } from '../../../pages/CartPage';
import { expectedTotals, money } from '../../../utils/pricing';
import { catalog } from '../../../utils/testData';

const earbuds = catalog.byName('Echo Earbuds'); // $25.00
const speaker = catalog.byName('Pulse Bluetooth Speaker'); // $49.99
const lamp = catalog.byName('Lumen Desk Lamp'); // $34.75
const stickers = catalog.byName('Sticker Pack'); // $0.99

test.describe('Shopping cart', () => {
  test(
    'adding a product from the list updates the badge and the cart',
    { tag: ['@smoke', '@regression'] },
    async ({ signedInCustomer: _signedIn, productsPage, cartPage }) => {
      await productsPage.goto();
      await productsPage.waitForLoad();

      await productsPage.addToCart(lamp.name);

      await expect(productsPage.toast).toHaveText(`Added ${lamp.name} to cart`);
      await expect(productsPage.header.cartCount).toHaveText('1');
      await cartPage.goto();
      await expect(cartPage.items).toHaveCount(1);
      await expect(cartPage.item(lamp.name).getByTestId('item-price')).toHaveText(
        money(lamp.price),
      );
      await expect(cartPage.quantityInput(lamp.name)).toHaveValue('1');
    },
  );

  test(
    'adding a quantity from the product page sets the line total',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, productDetailPage, cartPage }) => {
      await productDetailPage.goto(stickers.id);

      await productDetailPage.addToCart(3);

      await expect(productDetailPage.successMessage).toHaveText(
        `Added 3 × ${stickers.name} to your cart.`,
      );
      await expect(productDetailPage.header.cartCount).toHaveText('3');
      await cartPage.goto();
      await expect(cartPage.item(stickers.name).getByTestId('item-total')).toHaveText(
        money(stickers.price * 3),
      );
    },
  );

  test(
    'adding the same product twice increases its quantity instead of adding a row',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, productDetailPage, cartPage }) => {
      await productDetailPage.goto(earbuds.id);
      await productDetailPage.addToCart(1);
      await productDetailPage.addToCart(2);

      await cartPage.goto();

      await expect(cartPage.items).toHaveCount(1);
      await expect(cartPage.quantityInput(earbuds.name)).toHaveValue('3');
    },
  );

  test(
    'removing a product updates items, totals and the badge',
    { tag: ['@smoke', '@regression'] },
    async ({ signedInCustomer, cartPage }) => {
      await signedInCustomer.cart.fill([
        { productId: earbuds.id, quantity: 1 },
        { productId: lamp.id, quantity: 2 },
      ]);
      await cartPage.goto();

      await cartPage.remove(earbuds.name);

      await expect(cartPage.infoMessage).toHaveText('Item removed from cart.');
      await expect(cartPage.items).toHaveCount(1);
      await expect(cartPage.item(earbuds.name)).toHaveCount(0);
      await expect(cartPage.header.cartCount).toHaveText('2');
      await expect(cartPage.subtotal).toHaveText(money(lamp.price * 2));
    },
  );

  test(
    'removing the last product leaves an empty cart without a checkout link',
    { tag: '@regression' },
    async ({ signedInCustomer, cartPage }) => {
      await signedInCustomer.cart.fill([{ productId: lamp.id, quantity: 1 }]);
      await cartPage.goto();

      await cartPage.remove(lamp.name);

      await expect(cartPage.emptyMessage).toHaveText('Your cart is empty.');
      await expect(cartPage.checkoutLink).toHaveCount(0);
      await expect(cartPage.continueShoppingLink).toBeVisible();
    },
  );

  test(
    'updating a quantity recalculates line total and subtotal',
    { tag: '@regression' },
    async ({ signedInCustomer, cartPage }) => {
      await signedInCustomer.cart.fill([{ productId: lamp.id, quantity: 1 }]);
      await cartPage.goto();

      await cartPage.updateQuantity(lamp.name, 4);

      await expect(cartPage.infoMessage).toHaveText('Cart updated.');
      await expect(cartPage.item(lamp.name).getByTestId('item-total')).toHaveText(
        money(lamp.price * 4),
      );
      await expect(cartPage.summaryItems).toHaveText('4');
      await expect(cartPage.subtotal).toHaveText(money(lamp.price * 4));
    },
  );

  for (const quantity of ['1', '10']) {
    test(
      `accepts the boundary quantity ${quantity}`,
      { tag: '@regression' },
      async ({ signedInCustomer, cartPage }) => {
        await signedInCustomer.cart.fill([{ productId: stickers.id, quantity: 2 }]);
        await cartPage.goto();

        await cartPage.updateQuantity(stickers.name, quantity);

        await expect(cartPage.infoMessage).toHaveText('Cart updated.');
        await expect(cartPage.quantityInput(stickers.name)).toHaveValue(quantity);
      },
    );
  }

  for (const quantity of ['0', '11', '-1', '2.5', '']) {
    test(
      `rejects the invalid quantity "${quantity}" and keeps the cart unchanged`,
      { tag: '@regression' },
      async ({ signedInCustomer, cartPage }) => {
        await signedInCustomer.cart.fill([{ productId: stickers.id, quantity: 2 }]);
        await cartPage.goto();

        await cartPage.updateQuantity(stickers.name, quantity);

        await expect(cartPage.errorMessage).toHaveText('Quantity must be between 1 and 10.');
        await expect(cartPage.quantityInput(stickers.name)).toHaveValue('2');
      },
    );
  }

  test(
    'rejects adding more than the per-line maximum from the product page',
    { tag: '@regression' },
    async ({ signedInCustomer: _signedIn, productDetailPage }) => {
      await productDetailPage.goto(earbuds.id);

      await productDetailPage.addToCart(11);

      await expect(productDetailPage.errorMessage).toHaveText('Quantity must be between 1 and 10.');
      await expect(productDetailPage.header.cartCount).toHaveText('0');
    },
  );

  test(
    'subtotal, tax, shipping and total follow the pricing rules',
    { tag: ['@smoke', '@regression'] },
    async ({ signedInCustomer, cartPage }) => {
      const lines = [
        { product: stickers, quantity: 3 },
        { product: lamp, quantity: 1 },
      ];
      await signedInCustomer.cart.fill(
        lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      );
      const expected = expectedTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity })),
      );

      await cartPage.goto();

      await expect(cartPage.summaryItems).toHaveText(String(expected.itemCount));
      await expect(cartPage.subtotal).toHaveText(money(expected.subtotal));
      await expect(cartPage.tax).toHaveText(money(expected.tax));
      await expect(cartPage.shipping).toHaveText(
        expected.shipping === 0 ? 'Free' : money(expected.shipping),
      );
      await expect(cartPage.total).toHaveText(money(expected.total));
    },
  );

  test(
    'a subtotal of $49.99 is charged shipping, $50.00 ships free',
    { tag: '@regression' },
    async ({ signedInCustomer, cartPage }) => {
      await signedInCustomer.cart.fill([{ productId: speaker.id, quantity: 1 }]);
      await cartPage.goto();
      await expect(cartPage.subtotal).toHaveText('$49.99');
      await expect(cartPage.shipping).toHaveText('$5.00');

      await signedInCustomer.cart.clear();
      await signedInCustomer.cart.fill([{ productId: earbuds.id, quantity: 2 }]);
      await cartPage.goto();

      await expect(cartPage.subtotal).toHaveText('$50.00');
      await expect(cartPage.shipping).toHaveText('Free');
    },
  );

  test(
    'cart persists across reloads and a fresh login',
    { tag: '@regression' },
    async ({ page, signedInCustomer, cartPage, loginPage }) => {
      await signedInCustomer.cart.fill([{ productId: lamp.id, quantity: 2 }]);
      await cartPage.goto();
      await page.reload();
      await expect(cartPage.quantityInput(lamp.name)).toHaveValue('2');

      await cartPage.header.logout();
      await loginPage.login(signedInCustomer.credentials);
      await cartPage.goto();

      await expect(cartPage.quantityInput(lamp.name)).toHaveValue('2');
    },
  );

  test(
    'a new customer starts with an empty cart and cannot open checkout',
    { tag: '@regression' },
    async ({ page, signedInCustomer: _signedIn, cartPage }) => {
      await cartPage.goto();
      await expect(cartPage.emptyMessage).toBeVisible();
      await expect(cartPage.header.cartCount).toHaveText('0');

      await page.goto('/checkout');

      await expect(page).toHaveURL(/\/cart$/);
    },
  );

  test(
    'carts of different users are isolated from each other',
    { tag: '@regression' },
    async ({ browser, baseURL, signedInCustomer, authApi, data, cartPage }) => {
      // Arrange: a second, independent user in a separate browser context.
      const other = data.newUser();
      await authApi.registerUser(other);
      const otherSession = await authApi.authenticate(other);
      const otherContext = await browser.newContext();
      await otherContext.addCookies([
        { name: SESSION_COOKIE, value: otherSession.token, url: baseURL ?? '' },
      ]);
      const otherCart = new CartPage(await otherContext.newPage());

      // Act
      await signedInCustomer.cart.fill([{ productId: lamp.id, quantity: 1 }]);
      await otherCart.goto();
      await cartPage.goto();

      // Assert
      await expect(otherCart.emptyMessage).toBeVisible();
      await expect(cartPage.items).toHaveCount(1);
      await otherContext.close();
    },
  );
});
