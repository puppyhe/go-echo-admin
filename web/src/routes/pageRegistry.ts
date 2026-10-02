// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import PlaceholderPage from '../components/PlaceholderPage';
import { componentKey } from './pageKeys';
export { componentKey } from './pageKeys';

// Internal implementation detail.
export type LazyPage = LazyExoticComponent<ComponentType<Record<string, never>>>;

// Internal implementation detail.
const registry: Record<string, LazyPage> = {
  'business/product': lazy(() => import('../pages/business/product/Page')),
  'business/purchase': lazy(() => import('../pages/business/purchase/PurchasesPage')),
  // Internal implementation detail.
  about: lazy(() => import('../pages/about/AboutPage')),
  dashboard: lazy(() => import('../pages/dashboard/DashboardPage')),
  'enterprise/collab': lazy(() => import('../pages/enterprise/collab/CollaborationPage')),
  'org/position': lazy(() => import('../pages/org/PositionPage')),
  'org/department': lazy(() => import('../pages/org/DepartmentPage')),
  'flowCenter/todo': lazy(() =>
    import('../pages/enterprise/CenterPages').then((m) => ({ default: m.TasksCenterPage })),
  ),
  'flowCenter/start': lazy(() =>
    import('../pages/enterprise/CenterPages').then((m) => ({ default: m.StartCenterPage })),
  ),
  'flowCenter/work': lazy(() =>
    import('../pages/enterprise/CenterPages').then((m) => ({ default: m.InstancesCenterPage })),
  ),
  'flowCenter/delegations': lazy(() => import('../pages/enterprise/collab/DelegationsPage')),
  'flowCenter/config': lazy(() => import('../pages/enterprise/collab/RuntimeConfigPage')),
  'flowCenter/checkup': lazy(() => import('../pages/enterprise/collab/CheckupPage')),
  'flowCenter/definition': lazy(() =>
    import('../pages/enterprise/CenterPages').then((m) => ({ default: m.WorkflowsCenterPage })),
  ),
  'customFormCenter/customFormList': lazy(() =>
    import('../pages/enterprise/CenterPages').then((m) => ({ default: m.FormsCenterPage })),
  ),
  'monitor/jobs': lazy(() => import('../pages/enterprise/ops/JobsPage')),
  'superAdmin/permissionMatrix': lazy(() => import('../pages/superAdmin/PermissionMatrixPage')),
  'systemTools/auditReport': lazy(() => import('../pages/systemTools/AuditReportPage')),
  'systemTools/monitorOverview': lazy(() => import('../pages/systemTools/MonitorOverviewPage')),
  'notifyCenter/notifyInbox': lazy(() =>
    import('../pages/enterprise/notifications/NotificationsPage').then((m) => ({
      default: () => createElement(m.default, { mode: 'inbox' }),
    })),
  ),
  'notifyCenter/notifyChannel': lazy(() =>
    import('../pages/enterprise/notifications/NotificationsPage').then((m) => ({
      default: () => createElement(m.default, { mode: 'channels' }),
    })),
  ),
  'notifyCenter/notifyDelivery': lazy(() =>
    import('../pages/enterprise/notifications/NotificationsPage').then((m) => ({
      default: () => createElement(m.default, { mode: 'deliveries' }),
    })),
  ),
  'notifyCenter/notifyPreference': lazy(
    () => import('../pages/enterprise/notifications/PreferencesPanel'),
  ),
  'notifyCenter/notifyTemplate': lazy(
    () => import('../pages/enterprise/notifications/TemplatesPanel'),
  ),
  'notifyCenter/notifyConfig': lazy(
    () => import('../pages/enterprise/notifications/RuntimeConfigPanel'),
  ),
  'person/person': lazy(() => import('../pages/person/PersonPage')),
  // Internal implementation detail.
  superAdmin: lazy(() => import('./RouterHolder')),
  systemTools: lazy(() => import('./RouterHolder')),
  routerHolder: lazy(() => import('./RouterHolder')),
  plugin: lazy(() => import('./RouterHolder')),
  // Internal implementation detail.
  'superAdmin/user/user': lazy(() => import('../pages/superAdmin/UserPage')),
  'superAdmin/authority/authority': lazy(() => import('../pages/superAdmin/AuthorityPage')),
  'superAdmin/menu/menu': lazy(() => import('../pages/superAdmin/MenuPage')),
  'superAdmin/api/api': lazy(() => import('../pages/superAdmin/ApiPage')),
  'superAdmin/dictionary/sysDictionary': lazy(() => import('../pages/superAdmin/DictionaryPage')),
  'superAdmin/dictionary/sysDictionaryDetail': lazy(
    () => import('../pages/superAdmin/DictionaryDetailPage'),
  ),
  'superAdmin/operation/sysOperationRecord': lazy(
    () => import('../pages/superAdmin/OperationLogPage'),
  ),
  'superAdmin/params/sysParams': lazy(() => import('../pages/superAdmin/ParamsPage')),
  // Internal implementation detail.
  'systemConfig/security': lazy(() => import('../pages/systemTools/security/SecurityPage')),
  'systemTools/loginLog': lazy(() => import('../pages/systemTools/LoginLogPage')),
  // Internal implementation detail.
  'superAdmin/loginLog/sysLoginLog': lazy(() => import('../pages/systemTools/LoginLogPage')),
  // Internal implementation detail.
  // Internal implementation detail.
  'system/state': lazy(() => import('../pages/systemTools/ServerStatePage')),
  'systemTools/system/system': lazy(() => import('../pages/superAdmin/SystemConfigPage')),
  'systemTools/version/version': lazy(() => import('../pages/systemTools/VersionPage')),
  'systemTools/sysError/sysError': lazy(() => import('../pages/systemTools/SysErrorPage')),
  'plugin/announcement/view/info': lazy(() => import('../pages/plugin/AnnouncementPage')),
  'systemTools/serverState': lazy(() => import('../pages/systemTools/ServerStatePage')),
  'systemTools/apiToken': lazy(() => import('../pages/systemTools/ApiTokenPage')),
  'systemTools/fileCenter': lazy(() => import('../pages/systemTools/FileCenterPage')),
  'systemTools/sysError': lazy(() => import('../pages/systemTools/SysErrorPage')),
  'systemTools/exportTemplate/exportTemplate': lazy(
    () => import('../pages/systemTools/ExportTemplatePage'),
  ),
  'systemTools/sysVersion/sysVersion': lazy(() => import('../pages/systemTools/VersionPage')),
  // Internal implementation detail.
  'superAdmin/systemConfig': lazy(() => import('../pages/superAdmin/SystemConfigPage')),
  // Internal implementation detail.
  'plugin/announcement/view': lazy(() => import('../pages/plugin/AnnouncementPage')),
  'plugin/email/view': lazy(() => import('../pages/plugin/EmailPage')),
  // Internal implementation detail.
  // Internal implementation detail.
  // Internal implementation detail.
  'systemTools/formCreate': lazy(() => import('../pages/systemTools/FormCreatePage')),
  'systemTools/autoCode': lazy(() => import('../pages/systemTools/AutoCodePage')),
  // view/systemTools/autoPkg/autoPkg.vue
  'systemTools/autoPkg/autoPkg': lazy(() => import('../pages/systemTools/AutoPkgPage')),
  // Internal implementation detail.
  'systemTools/autoCodeAdmin': lazy(() => import('../pages/systemTools/AutoCodeAdminPage')),
  'systemTools/autoCode/history': lazy(() => import('../pages/systemTools/AutoCodeAdminPage')),
  // [[[autocode-registry]]]
  'autoGen/sales/sales': lazy(() => import('../autoGen/sales/view/Customer2Page')),
  // Internal implementation detail.
  // Internal implementation detail.
  // [[[end]]]
};

// Internal implementation detail.
export const registeredComponentPaths = Object.keys(registry);

/**
 * Component names in the original Vue application were also used as bookmark
 * paths.  The React menu keeps the current canonical path, but a few shipped
 * pages were moved under a new menu group.  Keep those old paths as aliases
 * whenever the corresponding menu entry is still authorized.
 */
const legacyAliases: Record<string, string[]> = {
  'superAdmin/loginLog/sysLoginLog': ['systemTools/loginLog'],
  'superAdmin/systemConfig': ['systemTools/system/system'],
  'systemTools/serverState': ['system/state'],
};

export function legacyRoutePaths(component: string): string[] {
  const key = componentKey(component);
  const aliases = legacyAliases[key] ?? [];
  // The component path itself is the stable legacy URL for leaf menus whose
  // current route was moved under another parent. De-duplicate aliases here so
  // route generation remains deterministic for imported menu trees.
  return [...new Set([key, ...aliases])].filter(Boolean);
}

// Internal implementation detail.
const placeholderCache = new Map<string, LazyPage>();

function placeholderFor(component: string): LazyPage {
  let page = placeholderCache.get(component);
  if (!page) {
    page = lazy(async () => ({
      default: () => createElement(PlaceholderPage, { component }),
    }));
    placeholderCache.set(component, page);
  }
  return page;
}

// Internal implementation detail.
export function resolvePage(component: string): { Page: LazyPage; registered: boolean } {
  const registered: LazyPage | undefined = registry[componentKey(component)];
  if (registered) return { Page: registered, registered: true };
  return { Page: placeholderFor(component), registered: false };
}
