// Menu icon identifiers mapped to Ant Design icons; legacy aliases remain readable.
import type { ReactNode } from 'react';
import {
  AppleOutlined,
  BookOutlined,
  CloudOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  CompassOutlined,
  ControlOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  DesktopOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExpandOutlined,
  FileTextOutlined,
  FilterOutlined,
  FolderOutlined,
  HighlightOutlined,
  HomeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  MessageOutlined,
  MonitorOutlined,
  PaperClipOutlined,
  PictureOutlined,
  PieChartOutlined,
  ProfileOutlined,
  ReadOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SlidersOutlined,
  StarOutlined,
  TableOutlined,
  TeamOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WarningOutlined,
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  SendOutlined,
  AuditOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  HeartOutlined,
  LoginOutlined,
  MenuOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SolutionOutlined,
} from '@ant-design/icons';

export const iconMap: Record<string, ReactNode> = {
  dashboard: <DashboardOutlined />,
  api: <ApiOutlined />,
  database: <DatabaseOutlined />,
  audit: <FileSearchOutlined />,
  health: <HeartOutlined />,
  login: <LoginOutlined />,
  'menu-list': <MenuOutlined />,
  robot: <RobotOutlined />,
  safety: <SafetyCertificateOutlined />,
  schedule: <ScheduleOutlined />,
  role: <SolutionOutlined />,
  'office-building': <ApartmentOutlined />,
  stamp: <AuditOutlined />,
  'data-analysis': <BarChartOutlined />,
  bell: <BellOutlined />,
  // Internal implementation detail.
  odometer: <DashboardOutlined />,
  odashboard: <DashboardOutlined />,
  timer: <ClockCircleOutlined />,
  connection: <LinkOutlined />,
  picture: <PictureOutlined />,
  position: <SendOutlined />,
  'circle-check': <CheckCircleOutlined />,
  'info-filled': <InfoCircleOutlined />,
  user: <UserOutlined />,
  message: <MessageOutlined />,
  management: <TableOutlined />,
  tools: <ToolOutlined />,
  'customer-gea': <CustomerServiceOutlined />,
  cloudy: <CloudOutlined />,
  cherry: <AppleOutlined />,
  avatar: <UserSwitchOutlined />,
  tickets: <ProfileOutlined />,
  platform: <DesktopOutlined />,
  coordinate: <EnvironmentOutlined />,
  notebook: <BookOutlined />,
  'pie-chart': <PieChartOutlined />,
  compass: <CompassOutlined />,
  operation: <ControlOutlined />,
  key: <KeyOutlined />,
  monitor: <MonitorOutlined />,
  server: <CloudServerOutlined />,
  warn: <WarningOutlined />,
  upload: <UploadOutlined />,
  'upload-filled': <CloudUploadOutlined />,
  folder: <FolderOutlined />,
  cpu: <CodeOutlined />,
  'magic-stick': <HighlightOutlined />,
  // Internal implementation detail.
  reading: <ReadOutlined />,
  shop: <ShopOutlined />,
  'shopping-cart': <ShoppingCartOutlined />,
  box: <InboxOutlined />,
  files: <FileTextOutlined />,
  document: <FileTextOutlined />,
  'picture-filled': <PictureOutlined />,
  'partly-cloudy': <CloudOutlined />,
  magnet: <PaperClipOutlined />,
  scaleToOriginal: <ExpandOutlined />,
  link: <LinkOutlined />,
  setting: <SettingOutlined />,
  home: <HomeOutlined />,
  list: <FileTextOutlined />,
  edit: <EditOutlined />,
  search: <SearchOutlined />,
  refresh: <ReloadOutlined />,
  email: <MailOutlined />,
  phone: <ControlOutlined />,
  lock: <LockOutlined />,
  star: <StarOutlined />,
  filter: <FilterOutlined />,
  team: <TeamOutlined />,
  sliders: <SlidersOutlined />,
};

// Internal implementation detail.
export const fallbackIcon: ReactNode = <AppstoreOutlined />;

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[\s_\-/]+/g, '')
    .toLowerCase();
}

const iconKeys = new Map(Object.keys(iconMap).map((key) => [normalizeIdentifier(key), key]));

function configuredIcon(name?: string): ReactNode | undefined {
  const normalized = normalizeIdentifier(name ?? '').replace(/outlined$/, '');
  const key = iconKeys.get(normalized === 'customergva' ? 'customergea' : normalized);
  return key ? iconMap[key] : undefined;
}

export function getIcon(name?: string): ReactNode {
  return configuredIcon(name) ?? fallbackIcon;
}

// Baseline menus may predate icon configuration. Resolve only known menu
// identities, so custom titles and unknown routes do not acquire unrelated icons.
const menuIconNames: Record<string, string> = {};
function registerMenuIcon(icon: string, identities: string[]) {
  for (const identity of identities) menuIconNames[normalizeIdentifier(identity)] = icon;
}

registerMenuIcon('dashboard', ['/dashboard', '仪表盘', '首页', '工作台']);
registerMenuIcon('platform', ['/platform', '平台中心']);
registerMenuIcon('office-building', [
  '/platform/tenants',
  'tenants',
  'tenantManagement',
  '租户管理',
]);
registerMenuIcon('safety', ['/iam', 'superAdmin', 'Administration', '权限管理', '管理中心']);
registerMenuIcon('user', ['/iam/users', 'user', 'users', '用户管理']);
registerMenuIcon('role', [
  '/iam/roles',
  'authority',
  'roles',
  'Roles and permissions',
  '角色管理',
  '角色与权限',
]);
registerMenuIcon('menu-list', ['/iam/menus', 'menu', 'menus', 'Menu management', '菜单管理']);
registerMenuIcon('office-building', [
  '/iam/departments',
  'orgManagement',
  'Organization',
  'orgDepartments',
  'departments',
  '组织管理',
  '部门管理',
]);
registerMenuIcon('team', ['orgPositions', 'positions', '岗位管理']);
registerMenuIcon('api', ['/iam/apis', 'api', 'apis', 'API management', 'API权限', 'API管理']);
registerMenuIcon('key', ['apiToken', 'API tokens', 'API令牌']);
registerMenuIcon('setting', [
  '/system',
  'systemSettings',
  'systemConfig',
  'System settings',
  '系统设置',
  '系统配置',
]);
registerMenuIcon('reading', ['/system/dictionaries', 'dictionary', 'dictionaries', '字典管理']);
registerMenuIcon('sliders', [
  '/system/params',
  'params',
  'System parameters',
  '参数配置',
  '系统参数',
]);
registerMenuIcon('monitor', ['/ops', 'monitor', 'Monitoring', '运维审计', '运维监控', '监控中心']);
registerMenuIcon('login', ['/ops/login-logs', 'loginLog', 'loginLogs', '登录日志']);
registerMenuIcon('audit', ['/ops/audit', 'operation', 'Operation logs', '操作审计', '操作日志']);
registerMenuIcon('health', [
  '/ops/health',
  'serverState',
  'Server status',
  '系统健康',
  '服务器状态',
]);
registerMenuIcon('warn', ['sysError', 'Error logs', '错误日志']);
registerMenuIcon('lock', ['securityConfig', 'security', '安全设置']);
registerMenuIcon('schedule', ['scheduledJobs', '定时任务']);
registerMenuIcon('files', ['fileLogViewer', 'File logs', '文件日志', '文件中心']);
registerMenuIcon('tool', []);
registerMenuIcon('tools', ['systemTools', 'System tools', '系统工具', '编程辅助']);
registerMenuIcon('cpu', ['autoCode', 'Code generator', '代码生成', '自动代码']);
registerMenuIcon('box', ['autoPkg', 'Package generator', '包生成器', '自动化包']);
registerMenuIcon('folder', ['autoCodeAdmin', 'Generated code', '已生成代码']);
registerMenuIcon('robot', [
  'aiWorkshop',
  'AI workspace',
  'AI 工作台',
  'AI 工坊',
  'aiWorkflow',
  'AI workflow',
  'AI 工作流',
]);
registerMenuIcon('bell', [
  'notifyCenter',
  'Notification center',
  'enterpriseNotifications',
  '通知中心',
  '通知管理',
]);
registerMenuIcon('message', ['anInfo', 'Announcements', '公告管理']);
registerMenuIcon('email', ['email', '邮件管理']);
registerMenuIcon('picture', ['media', '媒体管理']);
registerMenuIcon('shop', ['products', 'Products', '产品', '产品管理']);
registerMenuIcon('shopping-cart', ['purchaseOrders', '采购订单']);
registerMenuIcon('office-building', [
  'flowCenter',
  'Workflow center',
  'enterpriseCollab',
  '流程中心',
  '协作中心',
]);
registerMenuIcon('edit', [
  'customFormCenter',
  'customFormManagement',
  'formCreate',
  'Form center',
  'Form designer',
  '表单中心',
  '表单管理',
  '表单设计',
]);
registerMenuIcon('database', ['dataCenter', '数据中心']);
registerMenuIcon('user', ['person', 'Profile', '个人资料']);
registerMenuIcon('info-filled', ['about', '关于系统']);

export interface MenuIconSource {
  path?: string;
  name?: string;
  meta?: { icon?: string; title?: string };
}

export function getMenuIcon(node: MenuIconSource): ReactNode {
  const icon = node.meta?.icon?.trim() ?? '';
  const generic = ['', 'grid', 'menu', 'appstore', 'appstoreoutlined'].includes(
    normalizeIdentifier(icon),
  );
  // An explicit supported icon remains authoritative. Unknown custom icon
  // identifiers retain the neutral fallback instead of guessing their intent.
  if (!generic) return configuredIcon(icon) ?? fallbackIcon;
  const path = node.path?.split(/[?#]/)[0] ?? '';
  for (const identity of [
    path,
    node.name,
    node.meta?.title,
    path.split('/').filter(Boolean).at(-1),
  ]) {
    const name = identity && menuIconNames[normalizeIdentifier(identity)];
    if (name) return iconMap[name];
  }
  return fallbackIcon;
}

// Internal implementation detail.
export const iconNames: string[] = Object.keys(iconMap);
