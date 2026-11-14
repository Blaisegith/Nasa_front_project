export default function PageHeading({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow"><span />{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}