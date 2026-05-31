// ─────────────────────────────────────────────────────────────
// Azure SQL connection pool
// Uses mssql — works on Azure Functions Consumption plan.
// Pool is module-level so it survives warm invocations.
// ─────────────────────────────────────────────────────────────

import sql from 'mssql';

const config: sql.config = {
  server:   process.env.DB_SERVER!,   // e.g. myserver.database.windows.net
  database: process.env.DB_NAME!,
  user:     process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt:              true,  // Required for Azure SQL
    trustServerCertificate: false,
  },
  pool: {
    max:               10,
    min:               0,
    idleTimeoutMillis: 30_000,  // Release idle connections quickly (serverless)
  },
  connectionTimeout: 15_000,
  requestTimeout:    30_000,
};

// Singleton pool — reused across warm Azure Function invocations
let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

// Helper: run a named query with typed parameters
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const p = await getPool();
  const req = p.request();

  // Bind every key in params as a named input — prevents SQL injection
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      req.input(key, sql.NVarChar, null);
    } else if (typeof value === 'number') {
      req.input(key, sql.Decimal(18, 2), value);
    } else if (value instanceof Date) {
      req.input(key, sql.DateTimeOffset, value);
    } else {
      req.input(key, sql.NVarChar(sql.MAX), String(value));
    }
  }

  const result = await req.query(sqlText);
  return result.recordset as T[];
}

// Helper: run inside a transaction (for multi-step writes)
export async function withTransaction<T>(
  fn: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const p = await getPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    const result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
