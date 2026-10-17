import type { Locator, Page } from '@playwright/test';
import { AppHeader } from './AppHeader';

export class CartPage {
  readonly header: AppHeader;
  readonly heading: Locator;
  readonly items: Locator;
  readonly emptyMessage: Locator;
  readonly continueShoppingLink: Locator;
  readonly checkoutLink: Locator;
  readonly errorMessage: Locator;
  readonly infoMessage: Locator;
  readonly summaryItems: Locator;
  readonly subtotal: Locator;
  readonly tax: Locator;
  readonly shipping: Locator;
  readonly total: Locator;

  constructor(private readonly page: Page) {
    this.header = new AppHeader(page);
    this.heading = page.getByRole('heading', { name: 'Your cart' });
    this.items = page.getByTestId('cart-item');
    this.emptyMessage = page.getByTestId('empty-cart');
    this.continueShoppingLink = page.getByRole('link', { name: 'Continue shopping' });
    this.checkoutLink = page.getByRole('link', { name: 'Proceed to checkout' });
    this.errorMessage = page.getByTestId('cart-error');
    this.infoMessage = page.getByTestId('cart-message');
    this.summaryItems = page.getByTestId('summary-items');
    this.subtotal = page.getByTestId('summary-subtotal');
    this.tax = page.getByTestId('summary-tax');
    this.shipping = page.getByTestId('summary-shipping');
    this.total = page.getByTestId('summary-total');
  }

  async goto(): Promise<void> {
    await this.page.goto('/cart');
  }

  item(productName: string): Locator {
    return this.items.filter({
      has: this.page.getByRole('link', { name: productName, exact: true }),
    });
  }

  quantityInput(productName: string): Locator {
    return this.page.getByLabel(`Quantity for ${productName}`, { exact: true });
  }

  async updateQuantity(productName: string, quantity: number | string): Promise<void> {
    await this.quantityInput(productName).fill(String(quantity));
    await this.page.getByRole('button', { name: `Update quantity for ${productName}` }).click();
  }

  async remove(productName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Remove ${productName}` }).click();
  }

  async proceedToCheckout(): Promise<void> {
    await this.checkoutLink.click();
  }
}
