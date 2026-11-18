import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { useSession } from '@/store/session';
import { applyTheme, usePreferences } from '@/store/preferences';
import { ReauthProvider } from '@/components/security/ReauthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/States';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SetupPage } from '@/pages/auth/SetupPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ApplicationsPage } from '@/pages/applications/ApplicationsPage';
import { ApplicationDetailPage } from '@/pages/applications/ApplicationDetailPage';
import { AssetsPage } from '@/pages/assets/AssetsPage';
import { TeamPage } from '@/pages/TeamPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const onAuthError = (e: unknown) => {
  if (e instanceof ApiError && e.status === 401) useSession.getState().setSession(null);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

function ThemeSync() {
  const theme = usePreferences((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return null;
}

/** Loads the session once and sends first-time installs to setup. */
function Bootstrap() {
  const { loaded, setSession } = useSession();
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: api.setupStatus, staleTime: Infinity });
  const location = useLocation();

  useEffect(() => {
    if (!loaded) api.me().then(setSession).catch(() => setSession(null));
  }, [loaded, setSession]);

  if (!loaded || setup.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Starting ShieldOps" />
      </div>
    );
  }
  if (setup.data?.needsSetup && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  return <Outlet />;
}

function RequireAuth() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function PublicOnly() {
  const session = useSession((s) => s.session);
  return session ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <BrowserRouter>
        <ReauthProvider>
          <Routes>
            <Route element={<Bootstrap />}>
              <Route element={<PublicOnly />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/invite/:token" element={<AcceptInvitePage />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="applications" element={<ApplicationsPage />} />
                  <Route path="applications/:id/*" element={<ApplicationDetailPage />} />
                  <Route path="assets" element={<AssetsPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="soon/:slug" element={<ComingSoonPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </ReauthProvider>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}