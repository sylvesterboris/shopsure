import { expectSchema } from '../utils/assertions';
import type { ProductInputData } from '../utils/testDataFactory';
import type { ApiClient, ApiResult } from './ApiClient';
import { ProductSchema, type Product } from './schemas';

export interface ProductQuery {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';
}

export class ProductsApi {
  constructor(private readonly client: ApiClient) {}

  list(query: ProductQuery | Record<string, string | number> = {}): Promise<ApiResult> {
    return this.client.get('/api/products', { params: query as Record<string, string | number> });
  }

  get(id: number | string): Promise<ApiResult> {
    return this.client.get(`/api/products/${id}`);
  }

  create(input: Partial<ProductInputData> | Record<string, unknown>): Promise<ApiResult> {
    return this.client.post('/api/products', { data: input });
  }

  replace(
    id: number,
    input: Partial<ProductInputData> | Record<string, unknown>,
  ): Promise<ApiResult> {
    return this.client.put(`/api/products/${id}`, { data: input });
  }

  update(
    id: number,
    changes: Partial<ProductInputData> | Record<string, unknown>,
  ): Promise<ApiResult> {
    return this.client.patch(`/api/products/${id}`, { data: changes });
  }

  remove(id: number): Promise<ApiResult> {
    return this.client.delete(`/api/products/${id}`);
  }

  /** Setup helper: creates a product (requires an admin token). Throws on failure. */
  async createProduct(input: ProductInputData): Promise<Product> {
    const response = await this.create(input);
    if (response.status !== 201) {
      throw new Error(`Creating product failed with HTTP ${response.status}: ${response.text}`);
    }
    return expectSchema(ProductSchema, response.body, 'created product');
  }
}
