// Server-rendered SVG line chart: no client JS, renders in the crawlable HTML.
import styles from './seo.module.css';

interface Point {
  label: string; // ClickHouse local stamp "YYYY-MM-DD HH:MM:SS"
  value: number;
}

interface Props {
  points: Point[];
  unit: string;
  color?: string;
  title: string; // accessible description
  caption?: string;
}

const W = 900;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

const hourLabel = (stamp: string) => {
  const hh = Number(stamp.split(' ')[1]?.slice(0, 2));
  if (Number.isNaN(hh)) return '';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${hh < 12 ? 'am' : 'pm'}`;
};

export default function TrendChart({ points, unit, color = '#58A6FF', title, caption }: Props) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;

  const ticks = [max, (max + min) / 2, min];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={title}>
        <title>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#30363D" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8B949E" fontFamily="monospace">
              {Math.round(t).toLocaleString('en-CA')}
            </text>
          </g>
        ))}
        <path d={area} fill={color} fillOpacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#8B949E" fontFamily="monospace">
              {hourLabel(p.label)}
            </text>
          ) : null,
        )}
        <text x={PAD.left} y={PAD.top - 4} fontSize={10} fill="#6E7681" fontFamily="monospace">
          {unit}
        </text>
      </svg>
      {caption && <figcaption className={styles.chartCaption}>{caption}</figcaption>}
    </figure>
  );
}
