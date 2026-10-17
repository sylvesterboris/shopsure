import type { Locator, Page } from '@playwright/test';
import { AppHeader } from './AppHeader';

export class OrderConfirmationPage {
  readonly header: AppHeader;
  readonly heading: Locator;
  readonly orderNumber: Locator;
  readonly status: Locator;
  readonly customer: Locator;
  readonly items: Locator;
  readonly subtotal: Locator;
  readonly tax: Locator;
  readonly shipping: Locator;
  readonly total: Locator;
  readonly notFoundHeading: Locator;

  constructor(private readonly page: Page) {
    this.header = new AppHeader(page);
    this.heading = page.getByRole('heading', { name: 'Thank you for your order!' });
    this.orderNumber = page.getByTestId('order-id').getByRole('code');
    this.status = page.getByTestId('order-status');
    this.customer = page.getByTestId('order-customer');
    this.items = page.getByTestId('order-item');
    this.subtotal = page.getByTestId('summary-subtotal');
    this.tax = page.getByTestId('summary-tax');
    this.shipping = page.getByTestId('summary-shipping');
    this.total = page.getByTestId('summary-total');
    this.notFoundHeading = page.getByRole('heading', { name: 'Order not found' });
  }

  async goto(orderId: string): Promise<void> {
    await this.page.goto(`/orders/${orderId}`);
  }

  /** Order id taken from the URL, which is the canonical reference after checkout. */
  orderIdFromUrl(): string {
    const match = /\/orders\/([0-9a-f-]{36})$/.exec(new URL(this.page.url()).pathname);
    if (!match?.[1]) throw new Error(`Not on an order confirmation URL: ${this.page.url()}`);
    return match[1];
  }
}
