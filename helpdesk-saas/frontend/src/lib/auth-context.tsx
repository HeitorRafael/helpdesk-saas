import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AuthTenant, AuthUser, logoutSession, refreshSession } from './api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  tenant: AuthTenant | null;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, user: AuthUser, tenant: AuthTenant) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    accessToken: null,
    user: null,
    tenant: null,
  });

  useEffect(() => {
    // Access token só vive em memória (nunca em localStorage — SECURITY.md
    // §2). Um F5 perde o estado em memória, então recuperamos a sessão a
    // partir do cookie httpOnly de refresh token.
    refreshSession()
      .then((result) => {
        if (result) {
          setState({ status: 'authenticated', accessToken: result.accessToken, user: result.user, tenant: result.tenant });
        } else {
          setState({ status: 'anonymous', accessToken: null, user: null, tenant: null });
        }
      })
      .catch(() => setState({ status: 'anonymous', accessToken: null, user: null, tenant: null }));
  }, []);

  function login(accessToken: string, user: AuthUser, tenant: AuthTenant) {
    setState({ status: 'authenticated', accessToken, user, tenant });
  }

  async function logout() {
    if (state.accessToken) {
      await logoutSession(state.accessToken).catch(() => undefined);
    }
    setState({ status: 'anonymous', accessToken: null, user: null, tenant: null });
  }

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  return ctx;
}
