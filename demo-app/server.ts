import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { apiRouter } from './api';
import { DomainError } from './domain';
import { apiErrorBody, currentUser } from './http';
import { pageRouter } from './pages';
import { PgOrderRepository } from './pgOrderRepository';
import { InMemoryOrderRepository, Store, type OrderRepository, type SeedAccount } from './store';
import { notFoundPage } from './views';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function seedAccounts(): SeedAccount[] {
  const read = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Demo server needs ${name}. Copy .env.example to .env before starting.`);
    }
    return value;
  };
  return [
    {
      username: read('STANDARD_USER'),
      password: read('STANDARD_USER_PASSWORD'),
      displayName: 'Standard User',
      role: 'customer',
    },
    {
      username: read('LOCKED_USER'),
      password: read('LOCKED_USER_PASSWORD'),
      displayName: 'Locked User',
      role: 'customer',
      locked: true,
    },
    {
      username: read('ADMIN_USER'),
      password: read('ADMIN_USER_PASSWORD'),
      displayName: 'Admin User',
      role: 'admin',
    },
  ];
}

export function createApp(store: Store): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', req.header('X-Request-Id') ?? randomUUID());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', storage: store.orders.kind });
  });

  app.use('/api', apiRouter(store));
  app.use(pageRouter(store));

  app.use((req, res) => {
    const user = currentUser(store, req);
    res
      .status(404)
      .send(
        notFoundPage({ user, heading: 'Page not found', message: 'That page does not exist.' }),
      );
  });

  // Central error handler: JSON for the API, HTML for pages. Internal details are never leaked.
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const isApi = req.path.startsWith('/api');
    let domainError: DomainError;
    if (error instanceof DomainError) {
      domainError = error;
    } else if (error instanceof SyntaxError && 'body' in error) {
      domainError = new DomainError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else if (
      typeof error === 'object' &&
      error !== null &&
      (error as { type?: string }).type === 'entity.too.large'
    ) {
      domainError = new DomainError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    } else {
      console.error('Unhandled error', error);
      domainError = new DomainError(500, 'INTERNAL_ERROR', 'Something went wrong');
    }
    if (isApi) {
      res.status(domainError.status).json(apiErrorBody(domainError));
    } else {
      res.status(domainError.status).send(domainError.message);
    }
  });

  return app;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const repository: OrderRepository = databaseUrl
    ? new PgOrderRepository(databaseUrl)
    : new InMemoryOrderRepository();
  const store = new Store(repository, seedAccounts());
  await store.init();

  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = createApp(store).listen(port, host, () => {
    console.log(`ShopSure demo store on http://${host}:${port} (orders: ${repository.kind})`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void repository.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
