import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
