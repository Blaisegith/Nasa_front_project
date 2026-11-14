import { Compass, Flame, Rocket } from 'lucide-react';

/**
 * Graphiques schÃ©matiques de la page d'accueil.
 *
 * Les valeurs ne sont pas des mesures : le libellÃ© Â« schÃ©matique Â» et la note de
 * bas de section doivent rester visibles (aucune donnÃ©e inventÃ©e prÃ©sentÃ©e
 * comme rÃ©elle).
 */
export default function TrendChart({ title, subtitle, axis, variant, series }) {
  const transport = variant === 'transport';
  return (
    <article className="chart-card">
      <div className="chart-card-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="chart-tag">SCHÃ‰MA</span>
      </div>
      <svg className="science-chart" viewBox="0 0 620 260" role="img" aria-label={`${title}, courbes schÃ©matiques`}>
        <text className="chart-axis-title" x="17" y="125" transform="rotate(-90 17 125)">{axis}</text>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = 24 + line * 42;
          return (
            <g key={line}>
              <line className="chart-gridline" x1="62" y1={y} x2="592" y2={y} />
              <text className="chart-tick" x="50" y={y + 4} textAnchor="end">{100 - line * 25}</text>
            </g>
          );
        })}
        <line className="chart-axis" x1="62" y1="24" x2="62" y2="192" />
        <line className="chart-axis" x1="62" y1="192" x2="592" y2="192" />
        <text className="chart-tick" x="62" y="211" textAnchor="middle">0</text>
        <text className="chart-tick" x="327" y="211" textAnchor="middle">50</text>
        <text className="chart-tick" x="592" y="211" textAnchor="middle">100</text>
        <text className="chart-x-title" x="327" y="237" textAnchor="middle">{transport ? 'Position relative autour de la flamme' : 'Position relative dans la flamme'}</text>
        {transport ? (
          <>
            <path className="chart-line earth" d="M62 72 C120 82 155 91 208 111 S292 140 327 150 S430 170 485 178 S555 184 592 187" />
            <path className="chart-line microgravity" d="M62 186 C150 187 240 188 327 188 S500 189 592 189" />
            <path className="chart-line diffusion" d="M62 184 C125 166 165 142 208 132 S288 119 327 124 S405 145 455 159 S545 178 592 184" />
          </>
        ) : (
          <>
            <path className="chart-line earth" d="M62 181 C110 166 148 137 194 98 S270 47 310 49 S386 82 425 119 S520 164 592 181" />
            <path className="chart-line microgravity" d="M62 183 C118 168 160 148 210 123 S290 91 330 94 S412 123 457 151 S545 174 592 184" />
          </>
        )}
      </svg>
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.name}><i className={item.className} />{item.name}</span>
        ))}
      </div>
    </article>
  );
}

export function ResearchInsights() {
  return (
    <section className="research-section">
      <div className="research-heading">
        <div>
          <span className="eyebrow"><span /> COMPORTEMENT DU FEU</span>
          <h2>Quand la gravitÃ© disparaÃ®t, la flamme change.</h2>
        </div>
        <span className="chart-context">MICROGRAVITÃ‰ Â· ISS</span>
      </div>
      <div className="science-stats">
        <article className="science-stat">
          <span className="stat-icon coral"><Flame size={17} /></span>
          <div className="stat-value">â‰ˆ 0</div>
          <h3>Convection naturelle</h3>
          <p>Les gaz chauds ne montent presque plus.</p>
        </article>
        <article className="science-stat">
          <span className="stat-icon blue"><Compass size={17} /></span>
          <div className="stat-value">360Â°</div>
          <h3>Diffusion autour de la flamme</h3>
          <p>Lâ€™oxygÃ¨ne se rÃ©partit dans toutes les directions.</p>
        </article>
        <article className="science-stat">
          <span className="stat-icon green"><Rocket size={17} /></span>
          <div className="stat-value">2</div>
          <h3>Modes de transfert</h3>
          <p>Convection et diffusion, en proportions diffÃ©rentes.</p>
        </article>
      </div>
      <div className="chart-grid">
        <TrendChart
          title="Le transport des gaz"
          subtitle="En microgravitÃ©, la convection sâ€™efface."
          axis="IntensitÃ© relative"
          variant="transport"
          series={[
            { name: 'Convection Â· Terre', className: 'earth' },
            { name: 'Convection Â· microgravitÃ©', className: 'microgravity' },
            { name: 'Diffusion molÃ©culaire', className: 'diffusion' },
          ]}
        />
        <TrendChart
          title="TempÃ©rature autour de la flamme"
          subtitle="Le profil devient plus diffus en microgravitÃ©."
          axis="TempÃ©rature relative"
          variant="temperature"
          series={[
            { name: 'Terre', className: 'earth' },
            { name: 'MicrogravitÃ©', className: 'microgravity' },
          ]}
        />
      </div>
      <p className="chart-disclaimer">
        Courbes schÃ©matiques pour illustrer les tendances ; les valeurs varient selon le combustible et lâ€™expÃ©rience.
      </p>
    </section>
  );
}