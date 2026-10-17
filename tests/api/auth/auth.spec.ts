import { expect, test } from '../../../fixtures/testFixtures';
import { LoginResponseSchema, UserEnvelopeSchema } from '../../../api/schemas';
import { expectApiError, expectSchema } from '../../../utils/assertions';
import { accounts, env } from '../../../utils/environment';

test.describe('POST /api/auth/login', () => {
  test(
    'valid credentials return a bearer token and the user profile',
    { tag: ['@smoke', '@regression'] },
    async ({ authApi }) => {
      const credentials = accounts.standard();

      const response = await authApi.login(credentials);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const body = expectSchema(LoginResponseSchema, response.body);
      expect(body.user).toMatchObject({ username: credentials.username, role: 'customer' });
      expect(response.durationMs).toBeLessThan(env.apiResponseTimeLimitMs);
    },
  );

  test(
    'wrong password is rejected with 401 and no token',
    { tag: '@regression' },
    async ({ authApi }) => {
      const response = await authApi.login({
        username: accounts.standard().username,
        password: 'wrong-password',
      });

      expectApiError(response, 401, 'INVALID_CREDENTIALS');
      expect(response.text).not.toContain('token');
    },
  );

  test(
    'unknown user gets the same response as a wrong password (no user enumeration)',
    { tag: '@regression' },
    async ({ authApi }) => {
      const unknown = await authApi.login({ username: 'nobody_here', password: 'wrong-password' });
      const wrongPassword = await authApi.login({
        username: accounts.standard().username,
        password: 'wrong-password',
      });

      expect(unknown.status).toBe(wrongPassword.status);
      expect(unknown.body).toEqual(wrongPassword.body);
    },
  );

  test('locked account is refused with 403', { tag: '@regression' }, async ({ authApi }) => {
    expectApiError(await authApi.login(accounts.locked()), 403, 'ACCOUNT_LOCKED');
  });

  const invalidBodies: Array<[string, Record<string, unknown>]> = [
    ['missing username', { password: 'x' }],
    ['missing password', { username: 'x' }],
    ['empty strings', { username: '', password: '' }],
    ['wrong types', { username: 123, password: true }],
  ];
  for (const [name, body] of invalidBodies) {
    test(
      `rejects a malformed login payload: ${name}`,
      { tag: '@regression' },
      async ({ authApi }) => {
        const response = await authApi.login(body);

        expectApiError(response, 400, 'VALIDATION_ERROR');
      },
    );
  }

  test('rejects a body that is not valid JSON', { tag: '@regression' }, async ({ api }) => {
    const response = await api.post('/api/auth/login', {
      rawBody: '{"username": "a",',
      token: null,
    });

    expectApiError(response, 400, 'INVALID_JSON');
  });
});

test.describe('Token lifecycle', () => {
  test(
    'GET /api/auth/me returns the profile for a valid token',
    { tag: '@regression' },
    async ({ customer }) => {
      const response = await customer.auth.me();

      expect(response.status).toBe(200);
      expect(expectSchema(UserEnvelopeSchema, response.body).user.username).toBe(
        customer.credentials.username,
      );
    },
  );

  for (const [name, token] of [
    ['no token', null],
    ['an unknown token', 'f'.repeat(64)],
    ['a malformed token', 'not-a-token'],
  ] as const) {
    test(
      `GET /api/auth/me with ${name} returns 401`,
      { tag: '@regression' },
      async ({ authApi }) => {
        expectApiError(await authApi.me(token), 401, 'UNAUTHENTICATED');
      },
    );
  }

  test('logout revokes the token', { tag: ['@smoke', '@regression'] }, async ({ customer }) => {
    const logout = await customer.auth.logout();

    expect(logout.status).toBe(204);
    expectApiError(await customer.auth.me(), 401, 'UNAUTHENTICATED');
  });

  test(
    'each login issues a distinct token and both stay valid',
    { tag: '@regression' },
    async ({ authApi, customer }) => {
      const second = await authApi.authenticate(customer.credentials);

      expect(second.token).not.toBe(customer.token);
      expect((await authApi.me(customer.token)).status).toBe(200);
      expect((await authApi.me(second.token)).status).toBe(200);
    },
  );
});

test.describe('POST /api/auth/register', () => {
  test(
    'creates a customer account that can log in',
    { tag: '@regression' },
    async ({ authApi, data }) => {
      const user = data.newUser();

      const response = await authApi.register(user);

      expect(response.status).toBe(201);
      const created = expectSchema(UserEnvelopeSchema, response.body).user;
      expect(created).toMatchObject({
        username: user.username,
        displayName: user.displayName,
        role: 'customer',
      });
      expect(response.text).not.toContain(user.password);
      expect((await authApi.login(user)).status).toBe(200);
    },
  );

  test(
    'rejects a duplicate username with 409',
    { tag: '@regression' },
    async ({ authApi, customer, data }) => {
      const duplicate = data.newUser({ username: customer.credentials.username });

      expectApiError(await authApi.register(duplicate), 409, 'USERNAME_TAKEN');
    },
  );

  test('cannot be used to create an admin', { tag: '@regression' }, async ({ authApi, data }) => {
    const response = await authApi.register({ ...data.newUser(), role: 'admin' });

    expect(expectSchema(UserEnvelopeSchema, response.body).user.role).toBe('customer');
  });

  const accepted: Array<[string, Record<string, string>]> = [
    ['password of 8 characters', { password: 'Abc123!x' }],
    ['password of 64 characters', { password: 'p'.repeat(64) }],
  ];
  const rejected: Array<[string, Record<string, string>]> = [
    ['username of 2 characters', { username: 'ab' }],
    ['username with uppercase', { username: 'QA_UPPER' }],
    ['username of 33 characters', { username: 'a'.repeat(33) }],
    ['password of 7 characters', { password: 'Abc123!' }],
    ['password of 65 characters', { password: 'p'.repeat(65) }],
  ];
  for (const [name, override] of accepted) {
    test(`accepts ${name}`, { tag: '@regression' }, async ({ authApi, data }) => {
      expect((await authApi.register(data.newUser(override))).status).toBe(201);
    });
  }
  for (const [name, override] of rejected) {
    test(`rejects ${name}`, { tag: '@regression' }, async ({ authApi, data }) => {
      expectApiError(await authApi.register(data.newUser(override)), 400, 'VALIDATION_ERROR');
    });
  }
});
