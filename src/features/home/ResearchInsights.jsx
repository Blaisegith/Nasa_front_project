import { Compass, Flame, Rocket } from 'lucide-react';
import LineChart from '../../components/LineChart.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';

/**
 * Graphiques schématiques de la page d'accueil.
 *
 * Les valeurs ne sont pas des mesures : le libellé « schéma » et la note de
 * bas de section doivent rester visibles (aucune donnée inventée présentée
 * comme réelle).
 */

const TRANSPORT_SERIES = [
  {
    name: 'research.seriesConvectionEarth',
    className: 'earth',
    points: [[0, 71.4], [27.5, 48.2], [50, 25], [79.8, 8.3], [100, 3]],
  },
  {
    name: 'research.seriesConvectionMicro',
    className: 'microgravity',
    points: [[0, 3.6], [50, 2.4], [100, 1.8]],
  },
  {
    name: 'research.seriesDiffusion',
    className: 'diffusion',
    points: [[0, 4.8], [27.5, 35.7], [50, 40.5], [74.2, 19.6], [100, 4.8]],
  },
];

const TEMPERATURE_SERIES = [
  {
    name: 'research.seriesEarth',
    className: 'earth',
    points: [[0, 6.5], [24.9, 56], [46.8, 85.1], [68.5, 43.5], [100, 6.5]],
  },
  {
    name: 'research.seriesMicro',
    className: 'microgravity',
    points: [[0, 5.4], [27.9, 41.1], [50.6, 58.3], [74.5, 24.4], [100, 4.8]],
  },
];

export default function TrendChart({
  title, subtitle, axis, xLabel, series,
}) {
  const { t } = useI18n();
  const translated = series.map((item) => ({ ...item, name: t(item.name) }));

  return (
    <article className="chart-card">
      <div className="chart-card-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="chart-tag">{t('common.schematic')}</span>
      </div>
      <LineChart
        bare
        series={translated}
        yLabel={axis}
        xLabel={xLabel}
      />
    </article>
  );
}

export function ResearchInsights() {
  const { t } = useI18n();

  return (
    <section className="research-section">
      <div className="research-heading">
        <div>
          <span className="eyebrow"><span /> {t('research.eyebrow')}</span>
          <h2>{t('research.title')}</h2>
        </div>
        <span className="chart-context">{t('research.context')}</span>
      </div>
      <div className="science-stats">
        <article className="science-stat">
          <span className="stat-icon coral"><Flame size={17} /></span>
          <div className="stat-value">≈ 0</div>
          <h3>{t('research.stat1Title')}</h3>
          <p>{t('research.stat1Text')}</p>
        </article>
        <article className="science-stat">
          <span className="stat-icon blue"><Compass size={17} /></span>
          <div className="stat-value">360°</div>
          <h3>{t('research.stat2Title')}</h3>
          <p>{t('research.stat2Text')}</p>
        </article>
        <article className="science-stat">
          <span className="stat-icon green"><Rocket size={17} /></span>
          <div className="stat-value">2</div>
          <h3>{t('research.stat3Title')}</h3>
          <p>{t('research.stat3Text')}</p>
        </article>
      </div>
      <div className="chart-grid">
        <TrendChart
          title={t('research.transportTitle')}
          subtitle={t('research.transportSubtitle')}
          axis={t('research.transportAxis')}
          xLabel={t('research.transportX')}
          series={TRANSPORT_SERIES}
        />
        <TrendChart
          title={t('research.temperatureTitle')}
          subtitle={t('research.temperatureSubtitle')}
          axis={t('research.temperatureAxis')}
          xLabel={t('research.temperatureX')}
          series={TEMPERATURE_SERIES}
        />
      </div>
      <p className="chart-disclaimer">{t('research.disclaimer')}</p>
    </section>
  );
}