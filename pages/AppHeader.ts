import type { Locator, Page } from '@playwright/test';

/** Site header shared by every signed-in page. */
export class AppHeader {
  readonly cartLink: Locator;
  readonly cartCount: Locator;
  readonly currentUser: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    const banner = page.getByRole('banner');
    this.cartLink = banner.getByTestId('cart-link');
    this.cartCount = banner.getByTestId('cart-count');
    this.currentUser = banner.getByTestId('current-user');
    this.logoutButton = banner.getByRole('button', { name: 'Log out' });
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }

  async openCart(): Promise<void> {
    await this.cartLink.click();
  }
}
