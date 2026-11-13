const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Ativo', className: 'bg-green-mid/10 text-green-deep' },
  INACTIVE: { label: 'Inativo', className: 'bg-ink-soft/10 text-ink-soft' },
  OPEN: { label: 'Aberto', className: 'bg-blue-mid/10 text-blue-deep' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-chrome-2/20 text-chrome-3' },
  CLOSED: { label: 'Fechado', className: 'bg-green-mid/10 text-green-deep' },
};

export default function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, className: 'bg-ink-soft/10 text-ink-soft' };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${entry.className}`}
    >
      {entry.label}
    </span>
  );
}
