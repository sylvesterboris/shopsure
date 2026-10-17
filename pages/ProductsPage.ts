import { expect, type Locator, type Page } from '@playwright/test';
import { AppHeader } from './AppHeader';

export type SortOption =
  'Featured' | 'Price: low to high' | 'Price: high to low' | 'Name: A to Z' | 'Name: Z to A';

export class ProductsPage {
  readonly header: AppHeader;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly categorySelect: Locator;
  readonly sortSelect: Locator;
  readonly resultsCount: Locator;
  readonly productCards: Locator;
  readonly emptyState: Locator;
  readonly loadError: Locator;
  readonly retryButton: Locator;
  readonly toast: Locator;

  constructor(private readonly page: Page) {
    this.header = new AppHeader(page);
    this.heading = page.getByRole('heading', { name: 'Products', level: 1 });
    this.searchInput = page.getByLabel('Search products');
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.categorySelect = page.getByLabel('Category');
    this.sortSelect = page.getByLabel('Sort by');
    this.resultsCount = page.getByTestId('results-count');
    this.productCards = page.getByTestId('product-card');
    this.emptyState = page.getByTestId('empty-state');
    this.loadError = page.getByTestId('products-error');
    this.retryButton = page.getByRole('button', { name: 'Retry' });
    this.toast = page.getByTestId('toast');
  }

  async goto(params: Record<string, string> = {}): Promise<void> {
    const query = new URLSearchParams(params).toString();
    await this.page.goto(`/products${query ? `?${query}` : ''}`);
  }

  /**
   * Synchronisation point: the list is rendered client-side, so wait until the
   * loading text has been replaced by a result count or an error.
   */
  async waitForLoad(): Promise<void> {
    await expect(this.resultsCount).not.toHaveText('Loading products…');
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
    await this.waitForLoad();
  }

  async filterByCategory(label: string): Promise<void> {
    await this.categorySelect.selectOption({ label });
    await this.waitForLoad();
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortSelect.selectOption({ label: option });
    await this.waitForLoad();
  }

  card(productName: string): Locator {
    return this.productCards.filter({
      has: this.page.getByRole('link', { name: productName, exact: true }),
    });
  }

  async addToCart(productName: string): Promise<void> {
    await this.card(productName)
      .getByRole('button', { name: `Add to cart: ${productName}` })
      .click();
  }

  async openProduct(productName: string): Promise<void> {
    await this.card(productName).getByRole('link', { name: productName, exact: true }).click();
  }

  async productNames(): Promise<string[]> {
    return this.productCards.getByRole('heading').allTextContents();
  }

  /** Displayed prices as numbers, in on-screen order. */
  async productPrices(): Promise<number[]> {
    const texts = await this.productCards.getByTestId('product-price').allTextContents();
    return texts.map((t) => Number(t.replace(/[^0-9.]/g, '')));
  }
}
