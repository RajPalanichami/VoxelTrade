"use client";

export function Takeaways({ items }: { items: string[] }) {
  return (
    <div className="panel p-4 h-full">
      <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-3">KEY TAKEAWAYS</div>
      <ol className="space-y-2.5">
        {items.map((t, i) => (
          <li key={i} className="text-sm text-slate-300 leading-snug flex gap-2">
            <span className="text-accent font-semibold shrink-0">{i + 1}.</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      {!items.length && <div className="text-sm text-slate-500">Takeaways appear after live market data loads.</div>}
    </div>
  );
}
