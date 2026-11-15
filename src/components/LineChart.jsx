import { useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatNumber, formatTick } from '../lib/format.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

/**
 * Graphique scientifique (SVG, sans dépendance).
 *
 * - trois rendus selon la nature de la mesure : `line`, `area`, `bar` ;
 * - graduations « propres » (1 / 2 / 5 × 10ⁿ), grille discrète, axes lisibles ;
 * - légende, infobulle au survol **et** au clavier ;
 * - tracé animé à l'apparition, désactivé si l'utilisateur préfère moins de
 *   mouvement ;
 * - se dimensionne à son conteneur, y compris sur mobile.
 */

const WIDTH = 640;
const HEIGHT = 300;
const PAD = { top: 18, right: 18, bottom: 46, left: 62 };

const TICKS_TARGET = 5;

function niceStep(span, targetCount) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, targetCount);
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

export function niceTicks(min, max, targetCount = TICKS_TARGET) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceStep(max - min, targetCount);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/** Lissage Catmull-Rom → courbes de Bézier cubiques. */
export function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) {
    return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]}`;
  }

  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const c1x = current[0] + (next[0] - previous[0]) / 6;
    const c1y = current[1] + (next[1] - previous[1]) / 6;
    const c2x = next[0] - (after[0] - current[0]) / 6;
    const c2y = next[1] - (after[1] - current[1]) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
  }
  return d;
}

function inferKind(series, requested) {
  if (requested === 'area' || requested === 'bar' || requested === 'line') return requested;
  return 'line';
}

export default function LineChart({
  title,
  source,
  description,
  series = [],
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  interpretation,
  limitations = [],
  kind,
  bare = false,
}) {
  const gradientId = useId().replace(/:/g, '');
  const [activeIndex, setActiveIndex] = useState(null);
  const svgRef = useRef(null);
  const { t } = useI18n();

  const chartKind = inferKind(series, kind);

  const prepared = useMemo(() => {
    const visible = series.filter((item) => (item.points ?? []).length > 0);
    const allPoints = visible.flatMap((item) => item.points ?? []);
    if (!allPoints.length) return null;

    const xs = allPoints.map((point) => Number(point[0]));
    const ys = allPoints.map((point) => Number(point[1]));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);
    // Les barres partent toujours de zéro : sinon la comparaison ment.
    const baseline = chartKind === 'bar' ? Math.min(0, rawMinY) : rawMinY;
    const minY = baseline;
    const maxY = rawMaxY === baseline ? baseline + 1 : rawMaxY;

    const innerWidth = WIDTH - PAD.left - PAD.right;
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;

    const scaleX = (value) => PAD.left + ((value - minX) / (maxX - minX || 1)) * innerWidth;
    const scaleY = (value) => PAD.top + innerHeight - ((value - minY) / (maxY - minY || 1)) * innerHeight;

    const lines = visible.map((item, index) => {
      const points = (item.points ?? [])
        .map((point) => [Number(point[0]), Number(point[1])])
        .sort((a, b) => a[0] - b[0]);
      const mapped = points.map(([x, y]) => [scaleX(x), scaleY(y)]);
      return {
        name: item.name ?? `${index + 1}`,
        points,
        line: smoothPath(mapped),
        area: mapped.length
          ? `${smoothPath(mapped)} L${mapped[mapped.length - 1][0].toFixed(2)} ${scaleY(minY).toFixed(2)} `
            + `L${mapped[0][0].toFixed(2)} ${scaleY(minY).toFixed(2)} Z`
          : '',
        className: `series-${index % 6}`,
      };
    });

    // Barres : largeur déduite du nombre de séries et de l'espacement des x.
    const uniqueX = [...new Set(lines.flatMap((line) => line.points.map(([x]) => x)))].sort((a, b) => a - b);
    const slot = uniqueX.length > 1
      ? (scaleX(uniqueX[1]) - scaleX(uniqueX[0]))
      : innerWidth / Math.max(1, uniqueX.length);
    const groupWidth = Math.min(slot * 0.68, 64);
    const barWidth = Math.max(3, groupWidth / Math.max(1, lines.length));

    return {
      scaleX, scaleY, lines, minY, maxY, baseline,
      xTicks: niceTicks(minX, maxX, 6),
      yTicks: niceTicks(minY, maxY, 4),
      barWidth,
    };
  }, [series, chartKind]);

  if (!prepared) {
    return (
      <div className="answer-chart-empty">
        <AlertTriangle size={14} /> {t('answer.emptyChart')}
      </div>
    );
  }

  const {
    scaleX, scaleY, lines, minY, baseline, xTicks, yTicks, barWidth,
  } = prepared;

  const reference = lines[0]?.points ?? [];
  const hovered = activeIndex === null ? null : reference[activeIndex] ?? null;

  const moveTo = (index) => {
    if (!reference.length) return;
    const bounded = Math.max(0, Math.min(reference.length - 1, index));
    setActiveIndex(bounded);
  };

  const handlePointer = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !reference.length) return;
    const relative = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    reference.forEach(([x], index) => {
      const distance = Math.abs(scaleX(x) - relative);
      if (distance < best) { best = distance; nearest = index; }
    });
    setActiveIndex(nearest);
  };

  const tooltipLeft = hovered ? (scaleX(hovered[0]) / WIDTH) * 100 : 0;
  const flip = tooltipLeft > 62;

  return (
    <figure className={`answer-chart chart-${chartKind}${bare ? ' answer-chart-bare' : ''}`}>
      {!bare && (
        <div className="answer-chart-heading">
          <strong>{title}</strong>
          {source && <span className="answer-chart-source">{`${t('common.source')} : ${source}`}</span>}
        </div>
      )}
      {description && <p className="answer-chart-description">{description}</p>}

      <div className="answer-chart-canvas">
        <svg
          ref={svgRef}
          className="answer-chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={[
            title,
            xLabel ? `${t('answer.xAxis')} : ${xLabel}` : null,
            yLabel ? `${t('answer.yAxis')} : ${yLabel}` : null,
            `${t('answer.hoverHint')}`,
          ].filter(Boolean).join('. ')}
          tabIndex={0}
          onMouseMove={handlePointer}
          onMouseLeave={() => setActiveIndex(null)}
          onFocus={() => moveTo(activeIndex ?? 0)}
          onBlur={() => setActiveIndex(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') { event.preventDefault(); moveTo((activeIndex ?? -1) + 1); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); moveTo((activeIndex ?? reference.length) - 1); }
            if (event.key === 'Escape') setActiveIndex(null);
          }}
        >
          <defs>
            {lines.map((line) => (
              <linearGradient key={line.name} id={`${gradientId}-${line.className}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className={`answer-chart-fill-start ${line.className}`} />
                <stop offset="100%" className={`answer-chart-fill-end ${line.className}`} />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                className="answer-chart-grid"
                x1={PAD.left}
                y1={scaleY(tick)}
                x2={WIDTH - PAD.right}
                y2={scaleY(tick)}
              />
              <text className="answer-chart-tick" x={PAD.left - 10} y={scaleY(tick) + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text
              key={`x-${tick}`}
              className="answer-chart-tick"
              x={scaleX(tick)}
              y={HEIGHT - PAD.bottom + 20}
              textAnchor="middle"
            >
              {formatTick(tick)}
            </text>
          ))}

          <line
            className="answer-chart-axis"
            x1={PAD.left}
            y1={HEIGHT - PAD.bottom}
            x2={WIDTH - PAD.right}
            y2={HEIGHT - PAD.bottom}
          />
          <line
            className="answer-chart-axis"
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={HEIGHT - PAD.bottom}
          />
          {baseline > minY && (
            <line
              className="answer-chart-grid is-baseline"
              x1={PAD.left}
              y1={scaleY(baseline)}
              x2={WIDTH - PAD.right}
              y2={scaleY(baseline)}
            />
          )}

          {yLabel && (
            <text
              className="answer-chart-label"
              transform={`rotate(-90 16 ${HEIGHT / 2})`}
              x={16}
              y={HEIGHT / 2}
              textAnchor="middle"
            >
              {yLabel}
            </text>
          )}
          {xLabel && (
            <text className="answer-chart-label" x={WIDTH / 2} y={HEIGHT - 8} textAnchor="middle">
              {xLabel}
            </text>
          )}

          {chartKind === 'bar'
            ? lines.map((line, lineIndex) => (
              <g key={line.name} className={`answer-chart-bars ${line.className}`}>
                {line.points.map(([x, y]) => {
                  const groupOffset = (lineIndex - (lines.length - 1) / 2) * barWidth;
                  const top = Math.min(scaleY(y), scaleY(baseline));
                  const height = Math.max(1.5, Math.abs(scaleY(baseline) - scaleY(y)));
                  return (
                    <rect
                      key={`${line.name}-${x}`}
                      className="answer-chart-bar"
                      x={scaleX(x) + groupOffset - barWidth / 2}
                      y={top}
                      width={Math.max(2, barWidth - 1.5)}
                      height={height}
                      rx={Math.min(4, barWidth / 3)}
                    />
                  );
                })}
              </g>
            ))
            : lines.map((line) => (
              <g key={line.name} className={`answer-chart-series ${line.className}`}>
                {(chartKind === 'area' || lines.length === 1) && line.area && (
                  <path className="answer-chart-area" d={line.area} fill={`url(#${gradientId}-${line.className})`} />
                )}
                <path
                  className="answer-chart-line"
                  d={line.line}
                  fill="none"
                  pathLength={1}
                />
              </g>
            ))}

          {hovered && chartKind !== 'bar' && (
            <g className="answer-chart-cursor">
              <line
                className="answer-chart-crosshair"
                x1={scaleX(hovered[0])}
                y1={PAD.top}
                x2={scaleX(hovered[0])}
                y2={HEIGHT - PAD.bottom}
              />
              {lines.map((line) => {
                const point = line.points.find(([x]) => x === hovered[0]);
                if (!point) return null;
                return (
                  <circle
                    key={`cursor-${line.name}`}
                    className={`answer-chart-dot ${line.className}`}
                    cx={scaleX(point[0])}
                    cy={scaleY(point[1])}
                    r="4"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className={`answer-chart-tooltip ${flip ? 'flip' : ''}`}
            style={{ left: `${tooltipLeft}%` }}
            role="presentation"
          >
            <span className="answer-chart-tooltip-x">
              {xUnit ? `${formatNumber(hovered[0])} ${xUnit}` : formatNumber(hovered[0])}
            </span>
            {lines.map((line, index) => {
              const point = line.points.find(([x]) => x === hovered[0]);
              if (!point) return null;
              return (
                <span key={`tip-${line.name}`} className="answer-chart-tooltip-row">
                  <i className={`series-${index % 6}`} />
                  <em>{line.name}</em>
                  <strong>
                    {formatNumber(point[1])}
                    {yUnit ? ` ${yUnit}` : ''}
                  </strong>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="answer-chart-legend">
          {lines.map((line, index) => (
            <span key={line.name}>
              <i className={`series-${index % 6}`} />
              {line.name}
            </span>
          ))}
          {(xUnit || yUnit) && (
            <span className="answer-chart-legend-units">
              {yUnit ? `${yLabel ?? ''} (${yUnit})` : ''}
              {yUnit && xUnit ? ' · ' : ''}
              {xUnit ? `${xLabel ?? ''} (${xUnit})` : ''}
            </span>
          )}
        </div>
      )}

      {interpretation && <p className="answer-chart-interpretation">{interpretation}</p>}
      {limitations.length > 0 && (
        <p className="answer-chart-limitations">
          {`${t('answer.chartLimits')} : ${limitations.join(' \u00b7 ')}`}
        </p>
      )}
    </figure>
  );
}