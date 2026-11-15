import {
  decodeText, formatNumber, splitNumericTokens, splitScientific, toSuperscript,
} from '../lib/format.js';

/**
 * Affiche une valeur scientifique sans jamais la dénaturer.
 *
 * - `1.2e-7`  → 1,2 × 10⁻⁷
 * - `12.5`    → 12,5
 * - `0.004`   → 0,004
 * - l'unité reste attachée à la valeur (espace insécable)
 * - aucun `%` n'est ajouté si la valeur n'est pas un pourcentage
 */
export default function SciValue({
  value,
  unit,
  digits = 4,
  className = '',
  as: Tag = 'span',
  title,
}) {
  if (value === null || value === undefined || value === '') return null;

  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  const isNumeric = Number.isFinite(numeric);

  if (!isNumeric) {
    // Valeur non numérique (texte, ratio, mention) : affichée telle quelle.
    return <Tag className={`sci-value ${className}`.trim()}>{decodeText(String(value))}</Tag>;
  }

  const { mantissa, exponent } = splitScientific(numeric);
  const unitLabel = unit ? formatUnitLabel(unit) : '';

  return (
    <Tag
      className={`sci-value ${className}`.trim()}
      title={title ?? `${formatNumber(numeric, { maximumFractionDigits: digits })}${unitLabel ? ` ${unitLabel}` : ''}`}
    >
      {exponent === null ? formatNumber(numeric, { maximumFractionDigits: digits }) : (
        <>
          {formatNumber(Number.parseFloat(mantissa), { maximumFractionDigits: digits })}
          <span className="sci-times"> × </span>
          10<sup className="sci-exponent">{toSuperscript(exponent)}</sup>
        </>
      )}
      {unitLabel && <span className="sci-unit">{unitLabel.startsWith('%') ? unitLabel : `\u00a0${unitLabel}`}</span>}
    </Tag>
  );
}

export function formatUnitLabel(unit) {
  if (!unit) return '';
  const cleaned = String(unit)
    .replace(/\s*\^\s*\{?\s*(-?\d+)\s*\}?/g, (_, exponent) => toSuperscript(exponent))
    .replace(/\s*\*\s*/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * Texte enrichi : repère les valeurs numériques et les rend avec SciValue.
 * Le reste du texte est rendu tel quel (les accents et symboles sont conservés).
 */
export function RichText({ text, className = '' }) {
  const content = decodeText(String(text ?? ''));
  const tokens = splitNumericTokens(content);

  return (
    <span className={`rich-text ${className}`.trim()}>
      {tokens.map((token, index) => (token.type === 'number'
        ? <SciValue key={index} value={token.value} unit={token.unit} digits={6} />
        : <span key={index}>{token.value}</span>))}
    </span>
  );
}
