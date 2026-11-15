import { AlertTriangle, BookOpen } from 'lucide-react';
import LineChart from './LineChart.jsx';
import MediaFigure from './MediaFigure.jsx';
import { RichText } from './SciValue.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

/**
 * Rendu d'une réponse scientifique structurée.
 *
 * Le format est versionné côté backend (`schema_version`). Le frontend
 * n'invente jamais de contenu : une section absente n'est pas rendue.
 */

function Blocks({ blocks }) {
  const { t } = useI18n();
  if (!blocks?.length) return null;

  return (
    <div className="answer-blocks">
      {blocks.map((block, index) => {
        const kinds = [
          'notice', 'text', 'summary', 'scientific', 'simple', 'argument',
        ];
        if (kinds.includes(block.kind)) {
          return block.text
            ? (
              <p key={index} className={`answer-block ${block.kind}`}>
                <RichText text={block.text} />
              </p>
            )
            : null;
        }
        if (block.kind === 'image' || block.kind === 'video') {
          return (block.items ?? []).map((item, itemIndex) => (
            <MediaFigure key={`${index}-${itemIndex}`} item={item} />
          ));
        }
        if (block.kind === 'chart') {
          return (block.items ?? []).map((chart, chartIndex) => (
            <LineChart
              key={chart.chart_id ?? `${index}-${chartIndex}`}
              title={t(chart.title_key ?? '') || chart.title}
              source={chart.source}
              series={chart.series}
              xLabel={chart.x_axis}
              yLabel={chart.y_axis}
              xUnit={chart.x_unit}
              yUnit={chart.y_unit}
              kind={chart.kind}
              description={chart.description}
              interpretation={chart.interpretation}
              limitations={chart.limitations}
            />
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
  const { t } = useI18n();
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
      {answer.summary && <p className="answer-summary"><RichText text={answer.summary} /></p>}

      {answer.scientific_explanation && (
        <section className="answer-section">
          <h4>{t('answer.scientific')}</h4>
          <p><RichText text={answer.scientific_explanation} /></p>
        </section>
      )}

      {answer.simple_explanation && (
        <section className="answer-section answer-section-simple">
          <h4>{t('answer.simple')}</h4>
          <p><RichText text={answer.simple_explanation} /></p>
        </section>
      )}

      {arguments_.length > 0 && (
        <section className="answer-section">
          <h4>{t('answer.arguments')}</h4>
          <ul className="answer-arguments">
            {arguments_.map((argument, index) => <li key={index}>{argument}</li>)}
          </ul>
        </section>
      )}

      {charts.map((chart) => (
        <LineChart
          key={chart.chart_id ?? chart.title}
          title={t(chart.title_key ?? '') || chart.title}
          source={chart.source}
          series={chart.series}
          xLabel={chart.x_axis}
          yLabel={chart.y_axis}
          xUnit={chart.x_unit}
          yUnit={chart.y_unit}
          kind={chart.kind}
          description={chart.description}
          interpretation={chart.interpretation}
          limitations={chart.limitations}
        />
      ))}

      {media.length > 0 && (
        <div className="answer-media-grid">
          {media.map((item) => <MediaFigure key={item.media_id ?? item.title} item={item} />)}
        </div>
      )}

      <Blocks blocks={answer.blocks} />

      {references.length > 0 && (
        <section className="answer-section">
          <h4><BookOpen size={14} /> {t('answer.references')}</h4>
          <ol className="answer-references">
            {references.map((reference, index) => (
              <li key={index}>
                <span>{reference.label}</span>
                {reference.source && (
                  <em>
                    {reference.source}
                    {reference.page ? `, ${t('answer.page')} ${reference.page}` : ''}
                  </em>
                )}
                {reference.url && (
                  <a href={reference.url} target="_blank" rel="noreferrer">{t('answer.openReference')}</a>
                )}
                {reference.doi && (
                  <span className="answer-doi">
                    {`${t('answer.doi')} : ${reference.doi}`}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {limitations.length > 0 && (
        <section className="answer-limitations">
          <h4><AlertTriangle size={14} /> {t('answer.limitations')}</h4>
          <ul>
            {limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}