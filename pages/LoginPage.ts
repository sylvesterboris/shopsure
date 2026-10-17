import type { Locator, Page } from '@playwright/test';
import type { Credentials } from '../utils/environment';

export class LoginPage {
  readonly heading: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly infoMessage: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in to ShopSure' });
    this.usernameInput = page.getByLabel('Username');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Log in' });
    this.errorMessage = page.getByTestId('login-error');
    this.infoMessage = page.getByTestId('login-info');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login({ username, password }: Credentials): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
