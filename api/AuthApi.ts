import type { Credentials } from '../utils/environment';
import { expectSchema } from '../utils/assertions';
import type { NewUserData } from '../utils/testDataFactory';
import type { ApiClient, ApiResult } from './ApiClient';
import { LoginResponseSchema, UserEnvelopeSchema, type LoginResponse, type User } from './schemas';

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  login(credentials: Partial<Credentials> | Record<string, unknown>): Promise<ApiResult> {
    return this.client.post('/api/auth/login', { data: credentials, token: null });
  }

  register(user: Partial<NewUserData> | Record<string, unknown>): Promise<ApiResult> {
    return this.client.post('/api/auth/register', { data: user, token: null });
  }

  me(token?: string | null): Promise<ApiResult> {
    return this.client.get('/api/auth/me', token === undefined ? {} : { token });
  }

  logout(token?: string): Promise<ApiResult> {
    return this.client.post('/api/auth/logout', token === undefined ? {} : { token });
  }

  /** Setup helper: logs in and returns the validated session. Throws on failure. */
  async authenticate(credentials: Credentials): Promise<LoginResponse> {
    const response = await this.login(credentials);
    if (response.status !== 200) {
      throw new Error(`Login for "${credentials.username}" failed with HTTP ${response.status}`);
    }
    return expectSchema(LoginResponseSchema, response.body, 'login response');
  }

  /** Setup helper: registers a new customer account. Throws on failure. */
  async registerUser(user: NewUserData): Promise<User> {
    const response = await this.register(user);
    if (response.status !== 201) {
      throw new Error(
        `Registering "${user.username}" failed with HTTP ${response.status}: ${response.text}`,
      );
    }
    return expectSchema(UserEnvelopeSchema, response.body, 'register response').user;
  }
}
