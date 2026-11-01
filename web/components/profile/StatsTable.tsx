import styles from "@/components/profile/profile.module.css";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";

const LABELS: Record<string, string> = { ...TYPE_LABELS, ...DIFFICULTY_LABELS };

interface StatsTableProps {
  title: string;
  group: string;
  rows: Record<string, { solved: number; total: number }>;
}

export function StatsTable({ title, group, rows }: StatsTableProps) {
  return (
    <table className={styles.table} data-testid={`stats-${group}`}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col" className="visually-hidden">
            {title}
          </th>
          <th scope="col">Solved</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(rows).map(([key, { solved, total }]) => (
          <tr key={key} data-testid={`stats-row-${key}`}>
            <th scope="row">{LABELS[key] ?? key}</th>
            <td className="mono">{solved}</td>
            <td className="mono muted">{total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
