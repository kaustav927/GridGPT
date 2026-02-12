const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'ieso';

export async function query<T>(sql: string): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('default_format', 'JSON');
  url.searchParams.set('database', CLICKHOUSE_DATABASE);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
    next: { revalidate: 5 }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickHouse error: ${error}`);
  }

  const json = await response.json();
  return json.data as T[];
}

export async function execute(sql: string): Promise<void> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('database', CLICKHOUSE_DATABASE);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickHouse error: ${error}`);
  }
}
