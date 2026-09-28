import { escapeHtml } from '../status/views';

export type Point = { ts: number; value: number };

const WIDTH = 280;
const HEIGHT = 56;

/**
 * A small line chart as inline SVG (no library, no client JS). Up to two series share the y
 * scale; the stroke uses currentColor classes so it follows the light/dark theme.
 */
export function lineChart(
  series: Array<{ points: Point[]; className: string; label: string }>,
  format: (value: number) => string,
): string {
  const all = series.flatMap(s => s.points);
  if (all.length < 2) {
    return '<p class="muted chart-empty">No data in this range.</p>';
  }
  const minTs = Math.min(...all.map(p => p.ts));
  const maxTs = Math.max(...all.map(p => p.ts));
  const maxValue = Math.max(...all.map(p => p.value), 0);
  // All zeros: draw a flat line at the bottom (scale of 1 avoids dividing by zero), but still
  // report the real max, 0.
  const scale = maxValue || 1;
  const x = (ts: number) => ((ts - minTs) / (maxTs - minTs || 1)) * WIDTH;
  const y = (value: number) => HEIGHT - (value / scale) * (HEIGHT - 4) - 2;

  const lines = series
    .filter(s => s.points.length > 1)
    .map(
      s =>
        `<polyline class="${s.className}" fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${s.points
          .map(p => `${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`)
          .join(' ')}"><title>${escapeHtml(s.label)}</title></polyline>`,
    )
    .join('');
  const latest = series
    .filter(s => s.points.length > 0)
    .map(
      s =>
        `<span class="${s.className}-text">${escapeHtml(s.label)} ${format(s.points[s.points.length - 1].value)}</span>`,
    )
    .join(' · ');
  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(series.map(s => s.label).join(', '))}">${lines}</svg>
<p class="chart-legend">${latest} <span class="muted">(max ${format(maxValue)})</span></p>`;
}
