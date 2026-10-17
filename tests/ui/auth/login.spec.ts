import { expect, test } from '../../../fixtures/testFixtures';
import { accounts } from '../../../utils/environment';
import { loginCases } from '../../../utils/testData';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test(
    'standard user can log in and lands on the product catalogue',
    { tag: ['@smoke', '@regression'] },
    async ({ page, loginPage, productsPage }) => {
      // Arrange
      const credentials = accounts.standard();

      // Act
      await loginPage.login(credentials);

      // Assert
      await expect(page).toHaveURL(/\/products$/);
      await expect(productsPage.heading).toBeVisible();
      await expect(productsPage.header.currentUser).toHaveText('Signed in as Standard User');
    },
  );

  for (const scenario of loginCases.invalid()) {
    test(
      `rejects invalid credentials: ${scenario.case}`,
      { tag: '@regression' },
      async ({ page, loginPage }) => {
        await loginPage.login({ username: scenario.username, password: scenario.password });

        await expect(loginPage.errorMessage).toHaveText(scenario.expectedError);
        await expect(page).toHaveURL(/\/login$/);
        // The username is kept so the user can correct it; the password never is.
        await expect(loginPage.usernameInput).toHaveValue(scenario.username);
        await expect(loginPage.passwordInput).toHaveValue('');
      },
    );
  }

  for (const scenario of loginCases.empty()) {
    test(
      `shows a validation message when ${scenario.case}`,
      { tag: '@regression' },
      async ({ loginPage }) => {
        await loginPage.login({ username: scenario.username, password: scenario.password });

        await expect(loginPage.errorMessage).toHaveText(scenario.expectedError);
      },
    );
  }

  test(
    'locked account cannot log in and sees a specific message',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      await loginPage.login(accounts.locked());

      await expect(loginPage.errorMessage).toHaveText('This account is locked. Contact support.');
      await expect(page).toHaveURL(/\/login$/);
    },
  );

  test('password field masks its input', { tag: '@regression' }, async ({ loginPage }) => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });
});
