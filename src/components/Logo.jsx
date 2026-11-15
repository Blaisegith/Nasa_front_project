/**
 * Logotype « Frame in Freefall AI ».
 *
 * Concept : un cadre scientifique (deux croix de visée) qui contient la
 * trajectoire d'un objet en chute libre — un arc pointillé et son point
 * d'arrivée. L'ensemble reste lisible à 16 px et s'adapte aux thèmes
 * clairs et sombres via `currentColor`.
 */

const SIZES = { xs: 20, sm: 28, md: 36, lg: 48 };

export default function Logo({
  size = 'md',
  px,
  className = '',
  title,
  accent = 'var(--logo-accent, #ee8468)',
}) {
  const dimension = px ?? SIZES[size] ?? SIZES.md;
  const labelled = Boolean(title);

  return (
    <svg
      className={`logo-mark ${className}`.trim()}
      width={dimension}
      height={dimension}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {/* Cadre : deux croix de visée, pas un rectangle plein. */}
      <path
        d="M9 17V12.5A2.5 2.5 0 0 1 11.5 10H17"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M31 10h5.5A2.5 2.5 0 0 1 39 12.5V17"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M39 31v4.5A2.5 2.5 0 0 1 36.5 38H31"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M17 38h-5.5A2.5 2.5 0 0 1 9 35.5V31"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* Trajectoire de chute libre : accélération visible par l'espacement. */}
      <path
        d="M15 18.5c5.4 1.2 9 4.6 10.6 9.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="1 4.2"
        opacity="0.55"
      />

      {/* Objet en apesanteur. */}
      <circle cx="29.5" cy="31.5" r="4.2" fill={accent} />
      <circle cx="29.5" cy="31.5" r="7.2" stroke={accent} strokeWidth="1.1" opacity="0.35" />
    </svg>
  );
}

/** Verrouillage logo + nom, utilisé dans la barre supérieure et le pied de page. */
export function LogoLockup({
  title,
  subtitle,
  size = 'md',
  className = '',
  onClick,
  as = 'div',
}) {
  const Tag = as;
  const content = (
    <>
      <span className="logo-lockup-mark">
        <Logo size={size} />
      </span>
      <span className="logo-lockup-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </>
  );

  if (onClick) {
    return (
      <Tag
        className={`logo-lockup ${className}`.trim()}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(event);
          }
        }}
      >
        {content}
      </Tag>
    );
  }

  return <Tag className={`logo-lockup ${className}`.trim()}>{content}</Tag>;
}