import type { Locator, Page } from '@playwright/test';
import { AppHeader } from './AppHeader';

export class ProductDetailPage {
  readonly header: AppHeader;
  readonly name: Locator;
  readonly price: Locator;
  readonly category: Locator;
  readonly description: Locator;
  readonly quantityInput: Locator;
  readonly addToCartButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly outOfStock: Locator;
  readonly notFoundHeading: Locator;
  readonly backLink: Locator;

  constructor(private readonly page: Page) {
    this.header = new AppHeader(page);
    this.name = page.getByTestId('product-name');
    this.price = page.getByTestId('product-price');
    this.category = page.getByTestId('product-category');
    this.description = page.getByTestId('product-description');
    this.quantityInput = page.getByLabel('Quantity', { exact: true });
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
    this.successMessage = page.getByTestId('add-to-cart-message');
    this.errorMessage = page.getByTestId('add-to-cart-error');
    this.outOfStock = page.getByTestId('out-of-stock');
    this.notFoundHeading = page.getByRole('heading', { name: 'Product not found' });
    this.backLink = page.getByRole('link', { name: '← Back to products' });
  }

  async goto(id: number | string): Promise<void> {
    await this.page.goto(`/products/${id}`);
  }

  async addToCart(quantity: number | string = 1): Promise<void> {
    await this.quantityInput.fill(String(quantity));
    await this.addToCartButton.click();
  }
}
