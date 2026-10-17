import { expectSchema } from '../utils/assertions';
import type { ApiClient, ApiResult } from './ApiClient';
import { CartSchema, type Cart } from './schemas';

/** Cart endpoints. Mostly used to arrange UI tests quickly (API-driven test data setup). */
export class CartApi {
  constructor(private readonly client: ApiClient) {}

  get(): Promise<ApiResult> {
    return this.client.get('/api/cart');
  }

  add(productId: number, quantity = 1): Promise<ApiResult> {
    return this.client.post('/api/cart/items', { data: { productId, quantity } });
  }

  setQuantity(productId: number, quantity: number | string): Promise<ApiResult> {
    return this.client.patch(`/api/cart/items/${productId}`, { data: { quantity } });
  }

  remove(productId: number): Promise<ApiResult> {
    return this.client.delete(`/api/cart/items/${productId}`);
  }

  clear(): Promise<ApiResult> {
    return this.client.delete('/api/cart');
  }

  /** Setup helper: adds several items and returns the resulting cart. Throws on failure. */
  async fill(lines: Array<{ productId: number; quantity: number }>): Promise<Cart> {
    let last: ApiResult | undefined;
    for (const line of lines) {
      last = await this.add(line.productId, line.quantity);
      if (last.status !== 201) {
        throw new Error(
          `Adding product ${line.productId} failed with HTTP ${last.status}: ${last.text}`,
        );
      }
    }
    return expectSchema(CartSchema, (last ?? (await this.get())).body, 'cart');
  }
}
