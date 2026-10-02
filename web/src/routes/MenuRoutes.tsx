// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
import { Suspense, useMemo, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, Outlet, Route, useLocation } from 'react-router-dom';
import { useMenu } from '../menu/MenuContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { buildRouteTree, type RouteNode } from './dynamicRoutes';
import { legacyRoutePaths, resolvePage } from './pageRegistry';

// Internal implementation detail.
export function PageSpin() {
  return (
    <div className="page-loading">
      <Spin />
    </div>
  );
}

// Internal implementation detail.
export function MenuPage({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <section className="menu-page" aria-label={title}>
      {children}
    </section>
  );
}

// Internal implementation detail.
function ContainerPage({ absolutePath, redirect }: { absolutePath: string; redirect?: string }) {
  const location = useLocation();
  if (redirect && location.pathname.replace(/\/+$/, '') === absolutePath) {
    return <Navigate to={redirect} replace />;
  }
  return <Outlet />;
}

function LegacyRouteRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} replace />;
}

function renderRouteNode(node: RouteNode): ReactNode {
  const { Page } = resolvePage(node.componentKey);
  const key = `${node.path}-${node.componentKey}`;
  if (node.redirect) {
    // Internal implementation detail.
    return (
      <Route
        key={key}
        path={node.path}
        element={<ContainerPage absolutePath={node.absolutePath} redirect={node.redirect} />}
      >
        {node.children?.map(renderRouteNode)}
      </Route>
    );
  }
  const element = (
    <ErrorBoundary label={node.meta?.title || node.componentKey}>
      <Suspense fallback={<PageSpin />}>
        <MenuPage title={node.meta?.title}>
          <Page />
        </MenuPage>
      </Suspense>
    </ErrorBoundary>
  );
  return node.children?.length ? (
    <Route key={key} path={node.path} element={element}>
      {node.children.map(renderRouteNode)}
    </Route>
  ) : (
    <Route key={key} path={node.path} element={element} />
  );
}

function renderFlatRoutes(node: RouteNode, canonicalPaths: Set<string>): ReactNode[] {
  const aliases =
    !node.children?.length && node.componentKey !== 'routerHolder'
      ? legacyRoutePaths(node.componentKey)
          .map((alias) => `/${alias.replace(/^\/+/, '')}`)
          .filter((alias) => alias !== node.absolutePath && !canonicalPaths.has(alias))
          .map((alias) => (
            <Route
              key={`legacy:${node.absolutePath}:${alias}`}
              path={alias}
              element={<LegacyRouteRedirect to={node.absolutePath} />}
            />
          ))
      : [];
  return [
    renderRouteNode({ ...node, path: node.absolutePath, children: undefined }),
    ...aliases,
    ...(node.children || []).flatMap((child) => renderFlatRoutes(child, canonicalPaths)),
  ];
}

function collectCanonicalPaths(nodes: RouteNode[], result = new Set<string>()): Set<string> {
  for (const node of nodes) {
    result.add(node.absolutePath);
    collectCanonicalPaths(node.children ?? [], result);
  }
  return result;
}

// Internal implementation detail.
export function useMenuRoutes(): { layoutRoutes: ReactNode[]; standaloneRoutes: ReactNode[] } {
  const { tree } = useMenu();
  return useMemo(() => {
    const built = buildRouteTree(tree);
    const canonicalPaths = collectCanonicalPaths([...built.routes, ...built.standalone]);
    return {
      layoutRoutes: built.routes.flatMap((node) => renderFlatRoutes(node, canonicalPaths)),
      standaloneRoutes: built.standalone.flatMap((node) => renderFlatRoutes(node, canonicalPaths)),
    };
  }, [tree]);
}
