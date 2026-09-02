export function Metric({
  label,
  value,
  note,
  emphasis = false
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <article className={`metric${emphasis ? " metric-emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}
