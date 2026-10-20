export const COMPARE_LABELS = {
  previousClose: "Previous close",
  oneWeekAgo: "1 week ago",
  oneMonthAgo: "1 month ago",
  oneYearAgo: "1 year ago",
} as const;

export function TileCompareRows({
  rows,
  testId,
}: {
  rows: { label: string; text: string | null }[];
  testId?: string;
}) {
  return (
    <div className="mt-0.5 space-y-px" data-testid={testId}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-1 text-[7px] leading-none">
          <span className="text-slate-500 truncate">{row.label}</span>
          {row.text ? <span className="tick text-slate-300 truncate">{row.text}</span> : <span className="text-slate-600">—</span>}
        </div>
      ))}
    </div>
  );
}
