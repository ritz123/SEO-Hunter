export default function PriorityBadge({ priority, size = 'sm' }) {
  const cls = {
    A: 'bg-red-100    text-red-700    border-red-200    dark:bg-red-900/40   dark:text-red-400   dark:border-red-800',
    B: 'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800',
    C: 'bg-green-100  text-green-700  border-green-200  dark:bg-green-900/40 dark:text-green-400 dark:border-green-800',
  }[priority] ?? 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600';

  const label = priority ? `Priority ${priority}` : 'Unaudited';

  const sz = size === 'lg'
    ? 'px-2.5 py-1 text-xs font-700'
    : 'px-1.5 py-0.5 text-[10px] font-700';

  return (
    <span className={`inline-flex items-center rounded border font-bold uppercase tracking-wide ${sz} ${cls}`}>
      {label}
    </span>
  );
}
