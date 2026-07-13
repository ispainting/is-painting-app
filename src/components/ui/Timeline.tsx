import { formatDate } from "@/lib/utils";

export type TimelineItem = {
  at: Date | string;
  title: string;
  description?: string;
  type?: string;
};

export function Timeline({ items, emptyTitle, emptyDescription }: {
  items: TimelineItem[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <ol className="relative ml-2 border-l border-slate-200 pl-5">
        {items.map((item, index) => {
          const at = item.at instanceof Date ? item.at : new Date(item.at);
          return (
            <li key={`${item.title}-${at.toISOString()}-${index}`} className="mb-6 last:mb-0">
              <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-brand-500" />
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{formatDate(at)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.title}</div>
              {item.description ? <div className="mt-1 text-sm text-slate-600">{item.description}</div> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
