import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import { ThemeProvider } from './lib/theme-context';
import { SoundProvider } from './lib/sound-context';
import RequireAuth from './components/RequireAuth';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Landing from './pages/Landing';
import Signup from './pages/Signup';
import Conversations from './pages/Conversations';
import Dashboard from './pages/Dashboard';
import ClientsList from './pages/ClientsList';
import ClientCreate from './pages/ClientCreate';
import ClientDetail from './pages/ClientDetail';
import Tasks from './pages/Tasks';
import Monitor from './pages/Monitor';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Admin from './pages/Admin';
import InternalChat from './pages/InternalChat';

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SoundProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/cadastro" element={<Signup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/esqueci-senha" element={<ForgotPassword />} />
              <Route path="/redefinir-senha" element={<ResetPassword />} />
              <Route
                path="/conversas"
                element={
                  <Protected>
                    <Conversations />
                  </Protected>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <Protected>
                    <Dashboard />
                  </Protected>
                }
              />
              <Route
                path="/clientes"
                element={
                  <Protected>
                    <ClientsList />
                  </Protected>
                }
              />
              <Route
                path="/clientes/novo"
                element={
                  <Protected>
                    <ClientCreate />
                  </Protected>
                }
              />
              <Route
                path="/clientes/:id"
                element={
                  <Protected>
                    <ClientDetail />
                  </Protected>
                }
              />
              <Route
                path="/chamados"
                element={
                  <Protected>
                    <Tickets />
                  </Protected>
                }
              />
              <Route
                path="/chamados/:id"
                element={
                  <Protected>
                    <TicketDetail />
                  </Protected>
                }
              />
              <Route
                path="/tarefas"
                element={
                  <Protected>
                    <Tasks />
                  </Protected>
                }
              />
              <Route
                path="/monitor"
                element={
                  <Protected>
                    <Monitor />
                  </Protected>
                }
              />
              <Route
                path="/chat-interno"
                element={
                  <Protected>
                    <InternalChat />
                  </Protected>
                }
              />
              <Route
                path="/admin"
                element={
                  <Protected>
                    <Admin />
                  </Protected>
                }
              />
              <Route path="*" element={<Navigate to="/conversas" replace />} />
            </Routes>
          </AuthProvider>
        </SoundProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
