import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  APPLE_SIGNUP_URL,
  GOOGLE_SIGNUP_URL,
  completeOAuthSignup,
  login as loginRequest,
  registerCompany,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';

type Mode = 'entrar' | 'criar';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  email_exists: 'Já existe uma conta com esse e-mail — entre pela aba "Entrar".',
  oauth_not_configured: 'Login social ainda não configurado neste ambiente.',
  oauth_failed: 'Não foi possível concluir o login social. Tente de novo.',
};

export default function Login() {
  const navigate = useNavigate();
  const { status, login: loginCtx } = useAuth();
  const [searchParams] = useSearchParams();

  const pendingToken = searchParams.get('pendingToken');
  const oauthErrorCode = searchParams.get('error');

  const [mode, setMode] = useState<Mode>(pendingToken || oauthErrorCode ? 'criar' : 'entrar');
  const [error, setError] = useState<string | null>(
    oauthErrorCode ? (OAUTH_ERROR_MESSAGES[oauthErrorCode] ?? 'Não foi possível concluir o login social.') : null,
  );
  const [loading, setLoading] = useState(false);

  // Entrar
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Criar conta — manual
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Criar conta — completando depois de voltar do Google/Apple
  const [oauthCompanyName, setOauthCompanyName] = useState('');
  const [oauthPassword, setOauthPassword] = useState('');

  if (status === 'authenticated') {
    return <Navigate to="/conversas" replace />;
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginRequest({ email, password });
      loginCtx(result.accessToken, result.user, result.tenant);
      navigate('/conversas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await registerCompany({
        companyName: companyName.trim(),
        name: name.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      });
      loginCtx(result.accessToken, result.user, result.tenant);
      navigate('/conversas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteOAuthSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setLoading(true);
    try {
      const result = await completeOAuthSignup({
        pendingToken,
        companyName: oauthCompanyName.trim(),
        password: oauthPassword,
      });
      loginCtx(result.accessToken, result.user, result.tenant);
      navigate('/conversas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-surface-muted">
      {/* Painel esquerdo — identidade da marca */}
      <div className="relative md:w-1/2 min-h-[240px] md:min-h-screen bg-brand text-white flex flex-col justify-between overflow-hidden px-10 py-10 md:px-14 md:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-1/3 -top-1/4 h-[160%] w-[70%] rotate-[18deg]"
          style={{
            background:
              'linear-gradient(180deg, #B8BEC8 0%, #8B93A0 22%, #2E6FB0 46%, #1B3B5F 58%, #3C8C74 78%, #2B5F52 100%)',
            opacity: 0.9,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[28%] -top-1/4 h-[160%] w-[2px] rotate-[18deg] bg-white/30"
        />

        <div className="relative z-10">
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/50">
            Sistema · Multi-tenant
          </span>
          <h1 className="mt-4 font-display text-3xl md:text-4xl font-semibold leading-tight max-w-sm">
            Helpdesk
            <br />
            Intelligence
          </h1>
        </div>

        <p className="relative z-10 font-body text-sm text-white/60 max-w-xs leading-relaxed">
          Dados de atendimento organizados, analisados e transformados em ação
          para cada equipe da empresa.
        </p>
      </div>

      {/* Painel direito — formulário */}
      <div className="md:w-1/2 flex items-center justify-center px-6 py-12 md:px-16">
        <div className="w-full max-w-sm">
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setMode('entrar')}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'entrar' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('criar')}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'criar' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              Criar conta
            </button>
          </div>

          {mode === 'entrar' && (
            <>
              <h2 className="mt-6 font-display text-2xl font-semibold text-ink">Entrar</h2>
              <p className="mt-1 text-sm text-ink-soft">Acesse o painel da sua empresa.</p>

              <form onSubmit={handleLoginSubmit} className="mt-8 space-y-5" noValidate>
                <div>
                  <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                    E-mail
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium uppercase tracking-wide text-ink-soft"
                  >
                    Senha
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                  <Link to="/esqueci-senha" className="mt-1.5 inline-block text-xs text-blue-mid hover:underline">
                    Esqueci minha senha
                  </Link>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            </>
          )}

          {mode === 'criar' && pendingToken && (
            <>
              <h2 className="mt-6 font-display text-2xl font-semibold text-ink">Quase lá</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Identidade confirmada — só falta o nome da empresa e uma senha (pra você poder entrar depois sem
                precisar do Google/Apple de novo).
              </p>

              <form onSubmit={handleCompleteOAuthSubmit} className="mt-8 space-y-5" noValidate>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Nome da empresa
                  </label>
                  <input
                    type="text"
                    required
                    value={oauthCompanyName}
                    onChange={(e) => setOauthCompanyName(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Crie uma senha
                  </label>
                  <input
                    type="password"
                    required
                    value={oauthPassword}
                    onChange={(e) => setOauthPassword(e.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Criando…' : 'Concluir cadastro'}
                </button>
              </form>
            </>
          )}

          {mode === 'criar' && !pendingToken && (
            <>
              <h2 className="mt-6 font-display text-2xl font-semibold text-ink">Criar conta</h2>
              <p className="mt-1 text-sm text-ink-soft">Cadastre sua empresa e comece a usar.</p>

              <div className="mt-6 flex flex-col gap-2">
                <a
                  href={GOOGLE_SIGNUP_URL}
                  className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  <GoogleIcon className="h-4 w-4" />
                  Continuar com Google
                </a>
                <a
                  href={APPLE_SIGNUP_URL}
                  className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  <AppleIcon className="h-4 w-4" />
                  Continuar com Apple
                </a>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  ou preencha manualmente
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-5" noValidate>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Nome da empresa
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Seu nome</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">E-mail</label>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Senha</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-deep disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Criando…' : 'Criar empresa'}
                </button>
              </form>
            </>
          )}

          <p className="mt-8 font-mono text-[11px] text-ink-soft/60">
            Conexão protegida · autenticação por token
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A10.99 10.99 0 0012 23z"
      />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.09V7.06H2.18A11 11 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.85z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.36 1c.12 1.08-.32 2.15-.94 2.9-.65.79-1.72 1.4-2.75 1.32-.14-1.05.37-2.15 1-2.85.7-.8 1.87-1.38 2.69-1.37zM19.9 17.2c-.44 1.02-.65 1.48-1.22 2.38-.8 1.26-1.92 2.83-3.32 2.84-1.24.02-1.56-.81-3.24-.8-1.68.01-2.03.82-3.27.8-1.4-.02-2.46-1.43-3.26-2.69-2.23-3.5-2.47-7.6-1.09-9.79.98-1.55 2.53-2.46 3.98-2.46 1.48 0 2.41.83 3.63.83 1.19 0 1.9-.83 3.61-.83 1.29 0 2.66.7 3.63 1.92-3.2 1.75-2.68 6.3.55 7.8z" />
    </svg>
  );
}
