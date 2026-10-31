import pg from 'pg';

export type Pool = pg.Pool;
/** Anything that can run a query: the pool itself, or one connection inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>;

// BIGSERIAL ids arrive as strings by default; ids here are far below 2^53, so read them as numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
  }
  return new pg.Pool({ connectionString });
}
