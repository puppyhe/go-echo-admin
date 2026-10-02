// Internal implementation detail.
import { Suspense, lazy, useEffect } from 'react';
import { App as AntApp, Spin } from 'antd';
import { Route, Routes, useLocation } from 'react-router-dom';
import { bindMessageApi } from './api/feedback';
import { AuthProvider } from './auth/AuthContext';
import { MenuProvider, useMenu } from './menu/MenuContext';
import { formatMenuTitle, matchingMenus } from './menu/menuPaths';
import ErrorBoundary from './components/ErrorBoundary';
import { useMenuRoutes } from './routes/MenuRoutes';
import { session } from './api/request';
import { TenancyGate } from './tenancy/TenancyGate';
import { translateMenuTitle, zh } from './locale/zh';
const PlatformPage = lazy(() => import('./tenancy/PlatformPage'));

const AdminLayout = lazy(() => import('./layout/AdminLayout'));
const LoginPage = lazy(() => import('./pages/login/LoginPage'));
const InitPage = lazy(() => import('./pages/init/InitPage'));
const NotFoundPage = lazy(() => import('./pages/error/NotFoundPage'));
const DictionaryDetailPage = lazy(() => import('./pages/superAdmin/DictionaryDetailPage'));

const pageFallback = (
  <div className="page-loading">
    <Spin />
  </div>
);

// Internal implementation detail.
function FeedbackBinder() {
  const { message } = AntApp.useApp();
  useEffect(() => {
    bindMessageApi(message);
  }, [message]);
  return null;
}

// Internal implementation detail.
function RootRoutes() {
  const location = useLocation();
  const menuTitle = translateMenuTitle;
  const { nodeByPath } = useMenu();
  useEffect(() => {
    const match = matchingMenus(nodeByPath, location.pathname).at(-1);
    const title = match
      ? menuTitle(formatMenuTitle(match[1].meta.title, match[0], location.pathname, location.search), match[1].name || match[0])
      : location.pathname === '/login'
        ? zh['login']
        : location.pathname === '/init'
          ? zh['deploy']
          : 'go-echo-admin';
    document.title = `${title}${session.getTenant() ? ` · ${session.getTenant()!.name}` : ''} - go-echo-admin`;
  }, [location.pathname, location.search, nodeByPath, menuTitle]);
  const { layoutRoutes, standaloneRoutes } = useMenuRoutes();
  return (
    <Routes>
      {/* labelroute */}
      <Route
        path="/login"
        element={
          <ErrorBoundary label={zh['login']}>
            <Suspense fallback={pageFallback}>
              <LoginPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/init"
        element={
          <ErrorBoundary label={zh['deploy']}>
            <Suspense fallback={pageFallback}>
              <InitPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {/* meta.defaultMenu labelroute（labeldatalabel，label） */}
      {standaloneRoutes}
      {/* managementlabel */}
      <Route
        element={
          <ErrorBoundary label={zh['layout']}>
            <Suspense fallback={pageFallback}>
              <AdminLayout />
            </Suspense>
          </ErrorBoundary>
        }
      >
        {layoutRoutes}
        {/* dictionarydetailslabelroute。 */}
        <Route
          path="/superAdmin/dictionary/detail"
          element={
            <ErrorBoundary label="dictionarydetails">
              <Suspense fallback={pageFallback}>
                <DictionaryDetailPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="*"
          element={
            <ErrorBoundary label="404">
              <Suspense fallback={pageFallback}>
                <NotFoundPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  const location = useLocation();
  if (location.pathname === '/platform' || location.pathname.startsWith('/platform/'))
    return (
      <AuthProvider>
        <MenuProvider>
          <FeedbackBinder />
          <Suspense fallback={pageFallback}>
            <PlatformPage />
          </Suspense>
        </MenuProvider>
      </AuthProvider>
    );
  return (
    <TenancyGate>
      <AuthProvider>
        <MenuProvider>
          <FeedbackBinder />
          <Suspense fallback={pageFallback}>
            <RootRoutes />
          </Suspense>
        </MenuProvider>
      </AuthProvider>
    </TenancyGate>
  );
}
