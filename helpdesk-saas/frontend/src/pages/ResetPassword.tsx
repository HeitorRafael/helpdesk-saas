import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Link inválido — peça um novo em "Esqueci minha senha".');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-muted px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Criar nova senha</h1>
        <p className="mt-1 text-sm text-ink-soft">Escolha uma nova senha pra sua conta.</p>

        {!token && (
          <p className="mt-8 rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-600">
            Link inválido ou incompleto. Peça um novo em{' '}
            <Link to="/esqueci-senha" className="underline">
              esqueci minha senha
            </Link>
            .
          </p>
        )}

        {token && (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Nova senha</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 10 caracteres"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Confirmar senha</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        <Link to="/login" className="mt-6 block text-center text-sm text-blue-mid hover:underline">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
