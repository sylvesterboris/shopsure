import productsJson from '../test-data/products.json';
import usersJson from '../test-data/users.json';

export type CatalogProduct = {
  id: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  inStock: boolean;
};

export interface LoginCase {
  case: string;
  username: string;
  password: string;
  expectedError: string;
}

/** Replaces ${VAR} placeholders in JSON test data with environment values. */
function resolvePlaceholders(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) throw new Error(`Test data references unset variable ${name}`);
    return resolved;
  });
}

const resolveCase = (c: LoginCase): LoginCase => ({
  ...c,
  username: resolvePlaceholders(c.username),
  password: resolvePlaceholders(c.password),
});

export const catalog = {
  size: productsJson.catalogSize,
  categories: productsJson.categories,
  products: productsJson.products as CatalogProduct[],
  byName(name: string): CatalogProduct {
    const product = productsJson.products.find((p) => p.name === name);
    if (!product)
      throw new Error(`No catalogue product named "${name}" in test-data/products.json`);
    return product;
  },
};

export const loginCases = {
  invalid: (): LoginCase[] => usersJson.invalidLogins.map(resolveCase),
  empty: (): LoginCase[] => usersJson.emptyLogins.map(resolveCase),
};
