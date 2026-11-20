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
import { MonitorsPage } from '@/pages/monitoring/MonitorsPage';
import { MonitorDetailPage } from '@/pages/monitoring/MonitorDetailPage';
import { HeartbeatsPage } from '@/pages/monitoring/HeartbeatsPage';
import { SslDnsPage } from '@/pages/monitoring/SslDnsPage';
import { DomainExpiryPage } from '@/pages/monitoring/DomainExpiryPage';
import { SecurityHeadersPage } from '@/pages/monitoring/SecurityHeadersPage';
import { AlertsPage } from '@/pages/operations/AlertsPage';
import { FindingsPage } from '@/pages/operations/FindingsPage';
import { FindingDetailPage } from '@/pages/operations/FindingDetailPage';
import { AlertRulesPage } from '@/pages/admin/AlertRulesPage';
import { IngestionPage } from '@/pages/admin/IngestionPage';
import { ErrorsPage } from '@/pages/telemetry/ErrorsPage';
import { ErrorDetailPage } from '@/pages/telemetry/ErrorDetailPage';
import { PerformancePage } from '@/pages/telemetry/PerformancePage';
import { SecurityEventsPage } from '@/pages/telemetry/SecurityEventsPage';
import { LoginActivityPage } from '@/pages/telemetry/LoginActivityPage';
import { ServersPage } from '@/pages/infrastructure/ServersPage';
import { ServerDetailPage } from '@/pages/infrastructure/ServerDetailPage';
import { DatabasesPage } from '@/pages/infrastructure/DatabasesPage';
import { RepositoriesPage } from '@/pages/code/RepositoriesPage';
import { RepositoryDetailPage } from '@/pages/code/RepositoryDetailPage';
import { SecretsPage } from '@/pages/code/SecretsPage';
import { VulnerabilitiesPage } from '@/pages/code/VulnerabilitiesPage';
import { DependenciesPage } from '@/pages/code/DependenciesPage';
import { ImagesPage } from '@/pages/code/ImagesPage';
import { IntegrationsPage } from '@/pages/admin/IntegrationsPage';
import { IncidentsPage } from '@/pages/operations/IncidentsPage';
import { IncidentDetailPage } from '@/pages/operations/IncidentDetailPage';
import { RemediationPage } from '@/pages/operations/RemediationPage';
import { AiAnalystPage } from '@/pages/intel/AiAnalystPage';
import { RecommendationsPage } from '@/pages/intel/RecommendationsPage';
import { ReportsPage } from '@/pages/intel/ReportsPage';
import { ReportViewPage } from '@/pages/intel/ReportViewPage';
import { CompliancePage } from '@/pages/intel/CompliancePage';
import { ReleasesPage } from '@/pages/ops/ReleasesPage';
import { LogsPage } from '@/pages/ops/LogsPage';
import { AnomaliesPage } from '@/pages/ops/AnomaliesPage';
import { CloudIdentityPage } from '@/pages/security/CloudIdentityPage';
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
                  <Route path="monitors" element={<MonitorsPage />} />
                  <Route path="monitors/:id" element={<MonitorDetailPage />} />
                  <Route path="heartbeats" element={<HeartbeatsPage />} />
                  <Route path="ssl-dns" element={<SslDnsPage />} />
                  <Route path="domain-expiry" element={<DomainExpiryPage />} />
                  <Route path="security-headers" element={<SecurityHeadersPage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="findings" element={<FindingsPage />} />
                  <Route path="findings/:id" element={<FindingDetailPage />} />
                  <Route path="alert-rules" element={<AlertRulesPage />} />
                  <Route path="errors" element={<ErrorsPage />} />
                  <Route path="errors/:id" element={<ErrorDetailPage />} />
                  <Route path="performance" element={<PerformancePage />} />
                  <Route path="security-events" element={<SecurityEventsPage />} />
                  <Route path="login-activity" element={<LoginActivityPage />} />
                  <Route path="ingestion" element={<IngestionPage />} />
                  <Route path="servers" element={<ServersPage />} />
                  <Route path="servers/:id" element={<ServerDetailPage />} />
                  <Route path="databases" element={<DatabasesPage />} />
                  <Route path="repositories" element={<RepositoriesPage />} />
                  <Route path="repositories/:id" element={<RepositoryDetailPage />} />
                  <Route path="secrets" element={<SecretsPage />} />
                  <Route path="vulnerabilities" element={<VulnerabilitiesPage />} />
                  <Route path="dependencies" element={<DependenciesPage />} />
                  <Route path="images" element={<ImagesPage />} />
                  <Route path="integrations" element={<IntegrationsPage />} />
                  <Route path="incidents" element={<IncidentsPage />} />
                  <Route path="incidents/:id" element={<IncidentDetailPage />} />
                  <Route path="remediation" element={<RemediationPage />} />
                  <Route path="ai-analyst" element={<AiAnalystPage />} />
                  <Route path="recommendations" element={<RecommendationsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="reports/:id" element={<ReportViewPage />} />
                  <Route path="compliance" element={<CompliancePage />} />
                  <Route path="releases" element={<ReleasesPage />} />
                  <Route path="logs" element={<LogsPage />} />
                  <Route path="anomalies" element={<AnomaliesPage />} />
                  <Route path="cloud-identity" element={<CloudIdentityPage />} />
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