import { AlertTriangle, BookOpen } from 'lucide-react';
import MediaFigure from './MediaFigure.jsx';

/**
 * Rendu d'une réponse scientifique structurée.
 *
 * Le format est versionné côté backend (`schema_version`). Le frontend
 * n'invente jamais de contenu : une section absente n'est pas rendue.
 */

function ChartBlock({ chart }) {
  const series = chart.series ?? [];
  const allPoints = series.flatMap((item) => item.points ?? []);
  if (!allPoints.length) {
    return (
      <div className="answer-chart-empty">
        <AlertTriangle size={14} /> Aucune donnée disponible pour ce graphique.
      </div>
    );
  }

  const xs = allPoints.map((point) => point[0]);
  const ys = allPoints.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 560;
  const height = 200;
  const padX = 42;
  const padY = 18;

  const scaleX = (value) => padX + ((value - minX) / (maxX - minX || 1)) * (width - padX * 2);
  const scaleY = (value) => height - padY - ((value - minY) / (maxY - minY || 1)) * (height - padY * 2);

  return (
    <figure className="answer-chart">
      <div className="answer-chart-heading">
        <strong>{chart.title}</strong>
        {chart.source && <span className="answer-chart-source">Source : {chart.source}</span>}
      </div>

      <svg
        className="answer-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${chart.title}. Axe horizontal : ${chart.x_axis}. Axe vertical : ${chart.y_axis}.`}
      >
        <line className="answer-chart-axis" x1={padX} y1={padY} x2={padX} y2={height - padY} />
        <line
          className="answer-chart-axis"
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
        />
        <text className="answer-chart-tick" x={padX - 6} y={padY + 4} textAnchor="end">{maxY}</text>
        <text className="answer-chart-tick" x={padX - 6} y={height - padY} textAnchor="end">{minY}</text>
        <text className="answer-chart-tick" x={padX} y={height - 4} textAnchor="middle">{minX}</text>
        <text className="answer-chart-tick" x={width - padX} y={height - 4} textAnchor="middle">{maxX}</text>
        <text className="answer-chart-label" x={padX - 30} y={height / 2} transform={`rotate(-90 ${padX - 30} ${height / 2})`} textAnchor="middle">
          {chart.y_unit || chart.y_axis}
        </text>
        <text className="answer-chart-label" x={width / 2} y={height - 18} textAnchor="middle">
          {chart.x_unit || chart.x_axis}
        </text>

        {series.map((item, index) => {
          const path = (item.points ?? [])
            .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${scaleX(point[0]).toFixed(1)} ${scaleY(point[1]).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={item.name ?? index}
              className={`answer-chart-line series-${index % 5}`}
              d={path}
              fill="none"
            />
          );
        })}
      </svg>

      {series.length > 0 && (
        <div className="answer-chart-legend">
          {series.map((item, index) => (
            <span key={item.name ?? index}>
              <i className={`series-${index % 5}`} />
              {item.name}
            </span>
          ))}
        </div>
      )}

      {chart.interpretation && <p className="answer-chart-interpretation">{chart.interpretation}</p>}
      {chart.limitations?.length > 0 && (
        <p className="answer-chart-limitations">
          Limites : {chart.limitations.join(' · ')}
        </p>
      )}
    </figure>
  );
}

function Blocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="answer-blocks">
      {blocks.map((block, index) => {
        if (block.kind === 'notice' || block.kind === 'text' || block.kind === 'summary'
          || block.kind === 'scientific' || block.kind === 'simple' || block.kind === 'argument') {
          return block.text ? <p key={index} className={`answer-block ${block.kind}`}>{block.text}</p> : null;
        }
        if (block.kind === 'image' || block.kind === 'video') {
          const items = block.items ?? [];
          return items.map((item, itemIndex) => <MediaFigure key={`${index}-${itemIndex}`} item={item} />);
        }
        if (block.kind === 'chart') {
          return (block.items ?? []).map((chart, chartIndex) => (
            <ChartBlock key={`${index}-${chartIndex}`} chart={chart} />
          ));
        }
        if (block.kind === 'table') {
          return (
            <div className="answer-table" key={index}>
              {(block.items ?? []).map((row, rowIndex) => (
                <div className="answer-table-row" key={rowIndex}>
                  {Object.entries(row).map(([key, value]) => (
                    <span key={key}><em>{key}</em>{String(value)}</span>
                  ))}
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function AnswerRenderer({ answer }) {
  if (!answer) return null;

  const arguments_ = answer.arguments ?? [];
  const references = answer.references ?? [];
  const media = answer.media ?? [];
  const charts = answer.charts ?? [];
  const limitations = answer.limitations ?? [];

  const hasSections = Boolean(
    answer.summary
      || answer.scientific_explanation
      || answer.simple_explanation
      || arguments_.length
      || media.length
      || charts.length
      || references.length
      || limitations.length
      || answer.blocks?.length,
  );

  if (!hasSections) return null;

  return (
    <div className="answer">
      {answer.summary && <p className="answer-summary">{answer.summary}</p>}

      {answer.scientific_explanation && (
        <section className="answer-section">
          <h4>Explication scientifique</h4>
          <p>{answer.scientific_explanation}</p>
        </section>
      )}

      {answer.simple_explanation && (
        <section className="answer-section answer-section-simple">
          <h4>En termes simples</h4>
          <p>{answer.simple_explanation}</p>
        </section>
      )}

      {arguments_.length > 0 && (
        <section className="answer-section">
          <h4>Arguments</h4>
          <ul className="answer-arguments">
            {arguments_.map((argument, index) => <li key={index}>{argument}</li>)}
          </ul>
        </section>
      )}

      {media.length > 0 && (
        <div className="answer-media-grid">
          {media.map((item) => <MediaFigure key={item.media_id ?? item.title} item={item} />)}
        </div>
      )}

      {charts.map((chart) => <ChartBlock key={chart.chart_id ?? chart.title} chart={chart} />)}

      <Blocks blocks={answer.blocks} />

      {references.length > 0 && (
        <section className="answer-section">
          <h4><BookOpen size={14} /> Références</h4>
          <ol className="answer-references">
            {references.map((reference, index) => (
              <li key={index}>
                <span>{reference.label}</span>
                {reference.source && <em>{reference.source}{reference.page ? `, p. ${reference.page}` : ''}</em>}
                {reference.url && (
                  <a href={reference.url} target="_blank" rel="noreferrer">Ouvrir</a>
                )}
                {reference.doi && <span className="answer-doi">DOI : {reference.doi}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {limitations.length > 0 && (
        <section className="answer-limitations">
          <h4><AlertTriangle size={14} /> Limites et incertitudes</h4>
          <ul>
            {limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}