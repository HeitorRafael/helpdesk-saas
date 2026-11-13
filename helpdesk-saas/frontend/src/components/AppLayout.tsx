import { NavLink, useNavigate } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import PhoneWidget from './PhoneWidget';

const SIDEBAR_COLLAPSED_KEY = 'helpdesk-sidebar-collapsed';

const NAV_ITEMS = [
  { to: '/conversas', label: 'Conversas', icon: ChatIcon },
  { to: '/chat-interno', label: 'Chat interno', icon: TeamChatIcon },
  { to: '/dashboard', label: 'Dashboard', icon: GridIcon },
  { to: '/clientes', label: 'Clientes', icon: PeopleIcon },
  { to: '/chamados', label: 'Chamados', icon: TicketIcon },
  { to: '/tarefas', label: 'Tarefas', icon: ChecklistIcon },
  { to: '/monitor', label: 'Monitor', icon: MonitorIcon },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, tenant, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface-muted md:flex">
      <aside
        className={`border-b border-border bg-brand text-white transition-[width] duration-200 md:border-b-0 md:border-r md:py-8 ${
          collapsed ? 'md:w-[68px] md:px-3' : 'md:w-60 md:px-5'
        }`}
      >
        {/* Abaixo de md, a barra lateral vira uma faixa horizontal compacta —
            só ícones, sem empilhar os itens verticalmente no topo da página. */}
        <div className="flex items-center gap-2 px-3 py-2.5 md:hidden">
          <span className="shrink-0 font-display text-base font-semibold" title="Helpdesk Intelligence">
            HI
          </span>

          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <SidebarNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed />
            ))}
            {user?.role === 'ADMIN' && <SidebarNavLink to="/admin" label="Admin" icon={AdminIcon} collapsed />}
          </nav>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <ThemeIcon theme={theme} className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title={`Sair (${user?.name})`}
              className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* md pra cima: barra lateral recolhível, como já era. */}
        <div className="hidden md:flex md:h-full md:flex-col md:justify-between">
          <div>
            <div className={collapsed ? 'flex flex-col items-center gap-3' : 'flex items-center justify-between gap-2'}>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Sistema · Multi-tenant
                  </span>
                  {/* Sem truncate de propósito — quebra em até 2 linhas em vez
                      de cortar o nome do produto com "...". */}
                  <h1 className="mt-1 font-display text-lg font-semibold leading-tight">Helpdesk Intelligence</h1>
                </div>
              )}
              {collapsed && (
                <span className="font-display text-lg font-semibold" title="Helpdesk Intelligence">
                  HI
                </span>
              )}
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? 'Expandir menu' : 'Recolher menu'}
                className="shrink-0 rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <ChevronIcon direction={collapsed ? 'right' : 'left'} />
              </button>
            </div>

            <nav className="mt-8 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <SidebarNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={collapsed} />
              ))}
              {user?.role === 'ADMIN' && (
                <SidebarNavLink to="/admin" label="Admin" icon={AdminIcon} collapsed={collapsed} />
              )}
            </nav>
          </div>

          <div className={`border-t border-white/10 pt-4 ${collapsed ? 'flex flex-col items-center gap-3' : ''}`}>
            {!collapsed ? (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                  className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white"
                >
                  <ThemeIcon theme={theme} className="h-4 w-4" />
                  {theme === 'dark' ? 'Tema escuro' : 'Tema claro'}
                </button>

                <p className="mt-3 truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate font-mono text-[11px] text-white/50">
                  {user?.role} · {tenant?.name}
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 text-xs font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                  className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <ThemeIcon theme={theme} className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  title={`Sair (${user?.name})`}
                  className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <LogoutIcon className="h-[18px] w-[18px]" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>

      <PhoneWidget />
    </div>
  );
}

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          collapsed ? 'justify-center px-0' : ''
        } ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M4 5.5h16a1 1 0 011 1V15a1 1 0 01-1 1H9l-4 3.5V16H4a1 1 0 01-1-1V6.5a1 1 0 011-1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TeamChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M3.5 5.5h11a1 1 0 011 1V12a1 1 0 01-1 1H8l-3 2.5V13H3.5a1 1 0 01-1-1V6.5a1 1 0 011-1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 8.5h6.5a1 1 0 011 1V15a1 1 0 01-1 1H19v2.5L16.5 16H13a1 1 0 01-1-1v-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" strokeLinecap="round" />
      <path d="M16 4.5c1.7.3 3 1.9 3 3.5s-1.3 3.2-3 3.5" strokeLinecap="round" />
      <path d="M20.5 20c0-2.8-1.8-5.1-4-5.8" strokeLinecap="round" />
    </svg>
  );
}

function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 6.5l1.5 1.5L8 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 13.5l1.5 1.5L8 12.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20.5l1.5 1.5L8 19.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 6h9" strokeLinecap="round" />
      <path d="M11.5 13h9" strokeLinecap="round" />
      <path d="M11.5 20h9" strokeLinecap="round" />
    </svg>
  );
}

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M4 8.5a2 2 0 012-2h12a2 2 0 012 2v1.5a1.75 1.75 0 000 3.5V15a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5a1.75 1.75 0 000-3.5V8.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 7v10" strokeDasharray="2 2" strokeLinecap="round" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M12 3.5l7 3v5c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5v-5l7-3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 12l1.8 1.8L14.5 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20.5h6M12 16.5v4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`h-4 w-4 ${direction === 'right' ? 'rotate-180' : ''} ${className ?? ''}`}
    >
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeIcon({ theme, className }: { theme: 'light' | 'dark'; className?: string }) {
  // Mostra o ícone do estado pra onde o clique vai levar (padrão comum de toggle).
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="12" cy="12" r="4.5" />
        <path
          d="M12 3v2M12 19v2M4.5 12h-2M21.5 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M9 4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20H9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12H10" strokeLinecap="round" />
      <path d="M15.5 7.5L20 12l-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
