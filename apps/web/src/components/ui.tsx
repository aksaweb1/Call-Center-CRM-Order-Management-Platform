export function Card({
  title,
  value,
  icon,
  accent = 'bg-blue-50 text-blue-600',
  href,
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {icon && <span className={`rounded-lg p-2 ${accent}`}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {href && <span className="mt-2 inline-block text-xs font-medium text-blue-600">View →</span>}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow"
      >
        {inner}
      </a>
    );
  }
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{inner}</div>;
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-slate-500">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 flex-1 rounded bg-slate-200" style={{ opacity: 1 - j * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}