import { expect, test } from '../../../fixtures/testFixtures';
import { LoginPage } from '../../../pages/LoginPage';
import { ProductsPage } from '../../../pages/ProductsPage';
import { accounts } from '../../../utils/environment';

test.describe('Session and access control', () => {
  const protectedPaths = [
    '/products',
    '/products/1',
    '/cart',
    '/checkout',
    '/orders/00000000-0000-4000-8000-000000000000',
  ];

  for (const path of protectedPaths) {
    test(
      `anonymous visitor is redirected to login from ${path}`,
      { tag: '@regression' },
      async ({ page, loginPage }) => {
        await page.goto(path);

        await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
        await expect(loginPage.heading).toBeVisible();
        await expect(loginPage.infoMessage).toHaveText('Please log in to continue.');
      },
    );
  }

  test(
    'after login the user is returned to the page they originally requested',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      await page.goto('/cart');

      await loginPage.login(accounts.standard());

      await expect(page).toHaveURL(/\/cart$/);
    },
  );

  test(
    'login does not redirect to external sites via the next parameter',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      await page.goto('/login?next=//evil.example.com/phish');

      await loginPage.login(accounts.standard());

      await expect(page).toHaveURL(/\/products$/);
    },
  );

  test(
    'session survives a page reload and new tabs in the same browser',
    { tag: ['@smoke', '@regression'] },
    async ({ page, context, signedInCustomer, productsPage }) => {
      await productsPage.goto();
      await expect(productsPage.header.currentUser).toContainText(
        signedInCustomer.user.displayName,
      );

      await page.reload();
      await expect(productsPage.header.currentUser).toContainText(
        signedInCustomer.user.displayName,
      );

      const secondTab = await context.newPage();
      await secondTab.goto('/cart');
      await expect(secondTab.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    },
  );

  test(
    'logout ends the session and protected pages require login again',
    { tag: ['@smoke', '@regression'] },
    async ({ page, signedInCustomer, productsPage, loginPage, authApi }) => {
      await productsPage.goto();

      await productsPage.header.logout();

      await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
      await expect(loginPage.infoMessage).toHaveText('You have been logged out.');
      await page.goto('/cart');
      await expect(page).toHaveURL(/\/login\?next=/);
      // The server-side session is revoked, not just the cookie removed.
      expect((await authApi.me(signedInCustomer.token)).status).toBe(401);
    },
  );

  test(
    'logging out in one tab signs out the other tab on its next request',
    { tag: '@regression' },
    async ({ context, signedInCustomer: _signedIn }) => {
      const tabA = new ProductsPage(await context.newPage());
      const pageB = await context.newPage();
      await tabA.goto();
      await pageB.goto('/cart');

      await tabA.header.logout();
      await pageB.reload();

      await expect(new LoginPage(pageB).heading).toBeVisible();
    },
  );

  test(
    'visiting the login page while signed in goes straight to products',
    { tag: '@regression' },
    async ({ page, signedInCustomer: _signedIn }) => {
      await page.goto('/login');

      await expect(page).toHaveURL(/\/products$/);
    },
  );
});
