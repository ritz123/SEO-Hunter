export default function PriorityBadge({ priority, size = 'sm' }) {
  const cls = {
    A:    'bg-red-100 text-red-700 border-red-200',
    B:    'bg-amber-100 text-amber-700 border-amber-200',
    C:    'bg-green-100 text-green-700 border-green-200',
  }[priority] ?? 'bg-gray-100 text-gray-500 border-gray-200';

  const label = priority
    ? `Priority ${priority}`
    : 'Unaudited';

  const sz = size === 'lg'
    ? 'px-2.5 py-1 text-xs font-700'
    : 'px-1.5 py-0.5 text-[10px] font-700';

  return (
    <span className={`inline-flex items-center rounded border font-bold uppercase tracking-wide ${sz} ${cls}`}>
      {label}
    </span>
  );
}
