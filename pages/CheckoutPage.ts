import type { Locator, Page } from '@playwright/test';
import type { CustomerData } from '../utils/testDataFactory';
import { AppHeader } from './AppHeader';

export type CheckoutField = keyof CustomerData;

export class CheckoutPage {
  readonly header: AppHeader;
  readonly heading: Locator;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly postalCode: Locator;
  readonly placeOrderButton: Locator;
  readonly errorSummary: Locator;
  readonly fieldErrors: Locator;
  readonly total: Locator;

  constructor(private readonly page: Page) {
    this.header = new AppHeader(page);
    this.heading = page.getByRole('heading', { name: 'Checkout', level: 1 });
    this.firstName = page.getByLabel('First name');
    this.lastName = page.getByLabel('Last name');
    this.email = page.getByLabel('Email');
    this.postalCode = page.getByLabel('Postal code');
    this.placeOrderButton = page.getByRole('button', { name: 'Place order' });
    this.errorSummary = page.getByTestId('checkout-error');
    this.fieldErrors = page.getByTestId(/^(firstName|lastName|email|postalCode)-error$/);
    this.total = page.getByTestId('summary-total');
  }

  async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  fieldError(field: CheckoutField): Locator {
    return this.page.getByTestId(`${field}-error`);
  }

  /** The hidden one-time token the server uses to de-duplicate submissions. */
  async checkoutToken(): Promise<string> {
    return this.page.locator('input[name="checkoutToken"]').inputValue();
  }

  async fillShippingDetails(customer: Partial<CustomerData>): Promise<void> {
    if (customer.firstName !== undefined) await this.firstName.fill(customer.firstName);
    if (customer.lastName !== undefined) await this.lastName.fill(customer.lastName);
    if (customer.email !== undefined) await this.email.fill(customer.email);
    if (customer.postalCode !== undefined) await this.postalCode.fill(customer.postalCode);
  }

  async placeOrder(customer: Partial<CustomerData>): Promise<void> {
    await this.fillShippingDetails(customer);
    await this.placeOrderButton.click();
  }
}
