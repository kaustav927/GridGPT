'use client';

import { useEffect, useState } from 'react';
import { Card, HTMLTable, Spinner, Tag, Intent } from '@blueprintjs/core';

interface PriceData {
  zone: string;
  price: number;
  last_updated: string;
}

interface ApiResponse {
  data: PriceData[];
  timestamp: string;
  error?: string;
}

const formatPrice = (price: number) => {
  if (price < 0) return `−$${Math.abs(price).toFixed(2)}`;
  return `$${price.toFixed(2)}`;
};

const getPriceColor = (price: number) => {
  if (price < 0) return 'var(--status-green)';
  if (price > 100) return 'var(--status-red)';
  if (price > 50) return 'var(--status-yellow)';
  return 'var(--accent-cyan)';
};

export default function Home() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/prices');
      const json: ApiResponse = await res.json();

      if (json.error) {
        setError(json.error);
      } else {
        setPrices(json.data);
        setLastUpdate(json.timestamp);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          Ontario Grid Cockpit
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
          Real-time electricity grid monitoring
        </p>
      </header>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            Zonal Prices ($/MWh)
          </h2>
          {lastUpdate && (
            <Tag minimal style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              Updated: {new Date(lastUpdate).toLocaleTimeString()}
            </Tag>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size={24} />
          </div>
        ) : error ? (
          <Tag intent={Intent.DANGER} large>
            Error: {error}
          </Tag>
        ) : (
          <HTMLTable bordered striped compact>
            <thead>
              <tr>
                <th>Zone</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((row) => (
                <tr key={row.zone}>
                  <td>{row.zone}</td>
                  <td
                    className="mono-num"
                    style={{
                      textAlign: 'right',
                      color: getPriceColor(row.price),
                      fontWeight: 500
                    }}
                  >
                    {formatPrice(row.price)}
                  </td>
                  <td
                    className="mono-num"
                    style={{ textAlign: 'right', color: 'var(--text-muted)' }}
                  >
                    {new Date(row.last_updated).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <Card>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem'
          }}>
            API Endpoints
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
            <li><code>/api/prices</code></li>
            <li><code>/api/demand</code></li>
            <li><code>/api/fuel-mix</code></li>
            <li><code>/api/generators</code></li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
