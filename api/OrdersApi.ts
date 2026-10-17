import { expectSchema } from '../utils/assertions';
import type { CustomerData } from '../utils/testDataFactory';
import type { ApiClient, ApiResult } from './ApiClient';
import { OrderSchema, type Order } from './schemas';

export interface OrderLineInput {
  productId: number;
  quantity: number;
}

export interface OrderInput {
  customer: Partial<CustomerData>;
  /** Omit to order the current cart contents. */
  items?: OrderLineInput[];
}

export class OrdersApi {
  constructor(private readonly client: ApiClient) {}

  create(input: OrderInput | Record<string, unknown>, idempotencyKey?: string): Promise<ApiResult> {
    return this.client.post('/api/orders', {
      data: input,
      ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
    });
  }

  list(): Promise<ApiResult> {
    return this.client.get('/api/orders');
  }

  get(id: string): Promise<ApiResult> {
    return this.client.get(`/api/orders/${id}`);
  }

  cancel(id: string): Promise<ApiResult> {
    return this.client.patch(`/api/orders/${id}`, { data: { status: 'CANCELLED' } });
  }

  /** Setup helper: places an order and returns it validated. Throws on failure. */
  async placeOrder(input: OrderInput): Promise<Order> {
    const response = await this.create(input);
    if (response.status !== 201) {
      throw new Error(`Placing order failed with HTTP ${response.status}: ${response.text}`);
    }
    return expectSchema(OrderSchema, response.body, 'created order');
  }
}
