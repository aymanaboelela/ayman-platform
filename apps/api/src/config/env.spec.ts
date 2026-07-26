import { loadEnv } from './env';

const VALID = {
  NODE_ENV: 'development',
  API_PORT: '3300',
  APP_URL: 'http://localhost:3200',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  DIRECT_DATABASE_URL: 'postgresql://o:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('parses a valid environment and coerces the port to a number', () => {
    const env = loadEnv(VALID);
    expect(env.API_PORT).toBe(3300);
    expect(env.NODE_ENV).toBe('development');
  });

  it('crashes when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = VALID;
    expect(() => loadEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('crashes when DATABASE_URL is not a postgres URL', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('reports every invalid key at once rather than the first', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'nope', REDIS_URL: 'nope' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|REDIS_URL[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadEnv({ ...VALID, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
