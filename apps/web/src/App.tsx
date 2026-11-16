import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session.tsx';
import { Loading, Page } from './components/ui.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { CommunitiesPage } from './pages/CommunitiesPage.tsx';
import { CommunityLandingPage } from './pages/CommunityLandingPage.tsx';
import { CommunityPage } from './pages/CommunityPage.tsx';
import { ParcelNewPage } from './pages/ParcelNewPage.tsx';
import { ParcelDetailPage } from './pages/ParcelDetailPage.tsx';
import { ObservationPage } from './pages/ObservationPage.tsx';
import { PrioritiesPage } from './pages/PrioritiesPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { PlanPage } from './pages/PlanPage.tsx';
import { DownloadPage } from './pages/DownloadPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { AdminCommunityPage } from './pages/AdminCommunityPage.tsx';
import { RecoverPage } from './pages/RecoverPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { HelpPage, HowItWorksPage, PrivacyPage, TermsPage } from './pages/InfoPages.tsx';

/** «/»: portada para visitantes; inicio para quien ya entró. */
function Root() {
  const { me, loading } = useSession();
  if (loading) return <Page title="Qullqa" hideTitle><Loading /></Page>;
  return me ? <HomePage /> : <LandingPage />;
}

/** Quien ya inició sesión no necesita ver el formulario de ingreso. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Page title="Qullqa" hideTitle><Loading /></Page>;
  if (me) return <Navigate to={new URLSearchParams(loc.search).get('next') ?? '/'} replace />;
  return <>{children}</>;
}

function Private({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Page title="Qullqa" hideTitle><Loading /></Page>;
  if (!me) return <Navigate to={`/ingresar?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/ingresar" element={<GuestOnly><AuthPage /></GuestOnly>} />
          <Route path="/recuperar" element={<GuestOnly><RecoverPage /></GuestOnly>} />
          <Route path="/terminos" element={<TermsPage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/como-funciona" element={<HowItWorksPage />} />
          <Route path="/ayuda" element={<HelpPage />} />
          <Route path="/descargar" element={<DownloadPage />} />
          <Route path="/app" element={<Navigate to="/descargar" replace />} />
          <Route path="/admin" element={<Private><AdminPage /></Private>} />
          <Route path="/admin/c/:id" element={<Private><AdminCommunityPage /></Private>} />
          <Route path="/avisos" element={<Private><NotificationsPage /></Private>} />
          <Route path="/cuenta" element={<Private><AccountPage /></Private>} />
          <Route path="/comunidad/:slug" element={<CommunityLandingPage />} />
          <Route path="/unirse/*" element={<Navigate to="/comunidades" replace />} />
          <Route path="/comunidades" element={<Private><CommunitiesPage /></Private>} />
          <Route path="/" element={<Root />} />
          <Route path="/c/:cid" element={<Private><CommunityPage /></Private>} />
          <Route path="/c/:cid/plan" element={<Private><PlanPage /></Private>} />
          <Route path="/c/:cid/prioridades" element={<Private><PrioritiesPage /></Private>} />
          <Route path="/c/:cid/parcela/nueva" element={<Private><ParcelNewPage /></Private>} />
          <Route path="/c/:cid/p/:pid" element={<Private><ParcelDetailPage /></Private>} />
          <Route path="/c/:cid/p/:pid/obs/:type" element={<Private><ObservationPage /></Private>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
