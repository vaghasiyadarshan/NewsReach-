import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, truncateAll } from '../../../fixtures/db.ts';

const pool = createTestPool();

beforeEach(() => truncateAll(pool));
afterAll(() => pool.end());

describe('test database', () => {
  it('is migrated and isolated per test', async () => {
    await pool.query("INSERT INTO machines(id, name) VALUES ('M1', 'Processing Machine 1')");
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM machines');
    expect(rows[0].n).toBe(1);
  });

  it('starts each test empty', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM machines');
    expect(rows[0].n).toBe(0);
  });
});
