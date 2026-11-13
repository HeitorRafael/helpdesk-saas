import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-muted px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Informe seu e-mail — se houver conta cadastrada, enviamos um link pra criar uma nova senha.
        </p>

        {sent ? (
          <p className="mt-8 rounded-md border border-blue-mid/20 bg-blue-mid/5 px-3.5 py-3 text-sm text-ink">
            Se esse e-mail tiver uma conta, o link de redefinição chega em instantes. Pode fechar esta página.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Enviando…' : 'Enviar link de redefinição'}
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
