import { env } from './environment';

export interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  postalCode: string;
}

export interface NewUserData {
  username: string;
  password: string;
  displayName: string;
}

export interface ProductInputData {
  sku: string;
  name: string;
  description: string;
  category: 'audio' | 'wearables' | 'accessories' | 'home';
  price: number;
  inStock: boolean;
}

const FIRST_NAMES = ['Asha', 'Rohan', 'Meera', 'Kabir', 'Isha', 'Arjun', 'Nora', 'Liam'];
const LAST_NAMES = ['Sharma', 'Iyer', "O'Neil", 'Kapoor', 'Mehta', 'Smith-Jones', 'Verma', 'Das'];

/** Small seeded PRNG (mulberry32) so data can be reproduced from a seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Identifies this run so unique values never collide with data left by earlier runs,
// even when TEST_DATA_SEED makes all other values deterministic.
const RUN_ID = Date.now().toString(36).slice(-5);

/**
 * Creates test data for one test. Values derive from TEST_DATA_SEED (when set) plus a
 * per-test salt, so a failing test can be replayed with the same names/emails/quantities.
 * Identifiers additionally include a run id and worker index to stay unique under parallelism.
 */
export class TestDataFactory {
  readonly seed: number;
  private readonly random: () => number;
  private counter = 0;

  constructor(
    private readonly salt: string,
    private readonly workerIndex: number,
  ) {
    const seed = env.testDataSeed ?? Math.floor(Math.random() * 2 ** 31);
    this.seed = seed;
    this.random = mulberry32(seed ^ hash(salt));
  }

  private pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.random() * items.length)];
    if (item === undefined) throw new Error('pick() called with an empty list');
    return item;
  }

  private digits(count: number): string {
    return Array.from({ length: count }, () => Math.floor(this.random() * 10)).join('');
  }

  /** A short identifier unique to this test, worker and run. */
  uniqueSuffix(): string {
    this.counter += 1;
    return `${RUN_ID}${this.workerIndex}${hash(this.salt).toString(36).slice(0, 4)}${this.counter}`;
  }

  newUser(overrides: Partial<NewUserData> = {}): NewUserData {
    const suffix = this.uniqueSuffix();
    return {
      username: `qa_${suffix}`.toLowerCase().slice(0, 32),
      password: `Pw-${this.digits(6)}-${suffix}`,
      displayName: `${this.pick(FIRST_NAMES)} Tester`,
      ...overrides,
    };
  }

  customer(overrides: Partial<CustomerData> = {}): CustomerData {
    const firstName = this.pick(FIRST_NAMES);
    const lastName = this.pick(LAST_NAMES);
    return {
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${this.uniqueSuffix()}@example.test`,
      postalCode: `1${this.digits(5)}`,
      ...overrides,
    };
  }

  productInput(overrides: Partial<ProductInputData> = {}): ProductInputData {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const sku = `${Array.from({ length: 3 }, () => this.pick([...letters])).join('')}-${this.digits(3)}`;
    return {
      sku,
      name: `QA Test Product ${this.uniqueSuffix()}`,
      description: 'Created by an automated test and removed afterwards.',
      category: 'accessories',
      price: Number((1 + this.random() * 99).toFixed(2)),
      inStock: true,
      ...overrides,
    };
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
