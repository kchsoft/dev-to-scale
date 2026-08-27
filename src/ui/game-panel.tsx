export function PanelTitle({ code, title, badge }: { code: string; title: string; badge: string }) {
  return <header className="panel-title"><div><span>{code}</span><strong>{title}</strong></div><b>{badge}</b></header>;
}

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}
