interface BarProps {
  label: string;
  value: number;
  maxValue: number;
  onClick?: () => void;
}

export default function Bar({ label, value, maxValue, onClick }: BarProps) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
      }}
      className={onClick ? 'group w-full cursor-pointer text-left' : 'w-full'}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={`truncate text-ink ${onClick ? 'group-hover:text-blue-mid' : ''}`}>{label}</span>
        <span className="font-mono text-xs text-ink-soft">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-blue-mid transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
