// Internal implementation detail.
// Internal implementation detail.
import type { MenuMeta, MenuNode } from '../domain/menu';

// Internal implementation detail.
export interface RouteNode {
  path: string;
  // Internal implementation detail.
  absolutePath: string;
  // Internal implementation detail.
  componentKey: string;
  meta: MenuMeta;
  children?: RouteNode[];
  // Internal implementation detail.
  redirect?: string;
}

export interface BuiltRoutes {
  // Internal implementation detail.
  routes: RouteNode[];
  // Internal implementation detail.
  standalone: RouteNode[];
}

const EXTERNAL_RE = /^https?:\/\//i;

function joinPath(parent: string, child: string): string {
  return (child.startsWith('/') ? child : `${parent}/${child}`).replace(/\/+/g, '/');
}

interface ConvertResult {
  route: RouteNode;
  // Internal implementation detail.
  absolutePath: string;
}

// Internal implementation detail.
function reachableTarget(result: ConvertResult): string | null {
  if (result.route.redirect) return result.route.redirect;
  if (result.route.children?.length) return result.absolutePath;
  return result.absolutePath;
}

function convert(node: MenuNode, parentAbs: string): ConvertResult | null {
  // Internal implementation detail.
  if (EXTERNAL_RE.test(node.path) || node.component === '/') return null;

  const absolutePath = joinPath(parentAbs, node.path);
  const childResults = (node.children ?? [])
    .map((child) => convert(child, absolutePath))
    .filter((r): r is ConvertResult => r !== null);

  const route: RouteNode = {
    path: parentAbs === '' || node.path.startsWith('/') ? absolutePath : node.path,
    absolutePath,
    componentKey: node.component,
    meta: node.meta,
  };

  if (childResults.length > 0) {
    route.children = childResults.map((r) => r.route);
    // Internal implementation detail.
    route.redirect = childResults.map(reachableTarget).find(Boolean) ?? '/404';
  }

  return { route, absolutePath };
}

// Internal implementation detail.
export function buildRouteTree(menus: MenuNode[]): BuiltRoutes {
  const routes: RouteNode[] = [];
  const standalone: RouteNode[] = [];
  (menus ?? []).forEach((menu) => {
    const result = convert(menu, '');
    if (!result) return;
    if (menu.meta?.defaultMenu === true) standalone.push(result.route);
    else routes.push(result.route);
  });
  return { routes, standalone };
}
