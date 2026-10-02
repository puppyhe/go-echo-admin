// Internal implementation detail.
// Internal implementation detail.
import type { MenuMeta, MenuNode, MenuParameter, MenuBtn } from '../domain/menu';
import type { SysAuthority } from '../domain/authority';
import type { SysUser } from '../domain/user';
import type { ServerInfo } from '../domain/systemTools';

// Internal implementation detail.
type Loose = Record<string, unknown>;

// Internal implementation detail.
function asLoose(value: unknown): Loose {
  return value !== null && typeof value === 'object' ? (value as Loose) : {};
}

// Internal implementation detail.
function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Internal implementation detail.
function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

// Internal implementation detail.
function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// Older seeded menus used a placeholder title. Keep those rows usable when a
// database has not been reseeded yet, while preserving titles supplied by an
// administrator. The fallback is also used by the single-tenant build.
const MENU_TITLE_FALLBACKS: Record<string, string> = {
  dashboard: '仪表盘',
  superAdmin: '管理中心',
  orgManagement: '组织管理',
  monitor: '监控中心',
  media: '媒体管理',
  enterprise: '企业管理',
  aiWorkshop: 'AI 工作台',
  systemSettings: '系统设置',
  flowCenter: '流程中心',
  notifyCenter: '通知中心',
  customFormCenter: '表单中心',
  systemTools: '系统工具',
  plugin: '插件管理',
  person: '个人资料',
  authority: '角色与权限',
  menu: '菜单管理',
  api: 'API 管理',
  user: '用户管理',
  dictionary: '字典管理',
  operation: '操作日志',
  loginLog: '登录日志',
  params: '系统参数',
  systemConfig: '系统配置',
  serverState: '服务器状态',
  apiToken: 'API 令牌',
  sysError: '错误日志',
  exportTemplate: '导出模板',
  sysVersion: '版本管理',
  skills: '技能管理',
  autoCode: '代码生成',
  autoPkg: '包生成器',
  autoCodeAdmin: '已生成代码',
  aiWorkflow: 'AI 工作流',
  'plugin-mgr': '插件管理',
  anInfo: '公告管理',
  email: '邮件管理',
  formCreate: '表单设计',
  enterpriseCollab: '协作中心',
  enterpriseNotifications: '通知管理',
  purchaseOrders: '采购订单',
  orgDepartments: '部门管理',
  orgPositions: '岗位管理',
  securityConfig: '安全设置',
  scheduledJobs: '定时任务',
  fileLogViewer: '文件日志',
  cliCollections: 'AI 命令行',
  aiPageBuilder: 'AI 页面构建',
  flowTodo: '待办任务',
  flowStart: '发起流程',
  flowInstances: '流程实例',
  flowDefinitions: '流程定义',
  flowCheckup: '流程检查',
  flowRuntime: '流程设置',
  flowDelegations: '委托任务',
  notifyInbox: '收件箱',
  notifyPreference: '通知偏好',
  notifyTemplate: '通知模板',
  notifyChannel: '通知渠道',
  notifyDelivery: '通知投递',
  notifyConfig: '通知配置',
  customFormManagement: '表单管理',
};

function menuTitle(name: string, path: string, title: string): string {
  if (title && !/^(?:ai\s+)?description$/i.test(title.trim())) return title;
  const key = MENU_TITLE_FALLBACKS[name] || MENU_TITLE_FALLBACKS[path];
  if (key) return key;
  const source = name || path;
  return source
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_/]+/g, ' ')
    .replace(/^./, (value) => value.toUpperCase()) || '菜单';
}

/** Flatten the server collector DTO; missing/invalid measurements remain unknown, never zero. */
export function normalizeServerInfo(value: unknown): ServerInfo {
  const envelope = asLoose(value);
  const raw =
    envelope.server && typeof envelope.server === 'object' ? asLoose(envelope.server) : envelope;
  const os = asLoose(raw.os);
  const cpu = asLoose(raw.cpu);
  const ram = asLoose(raw.ram);
  const nonnegative = (input: unknown): number | undefined =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : undefined;
  const percentage = (input: unknown): number | undefined => {
    const number = nonnegative(input);
    return number !== undefined && number <= 100 ? number : undefined;
  };
  const bytes = (input: unknown, unit: number): number | undefined => {
    const number = nonnegative(input);
    return number !== undefined && Number.isFinite(number * unit) ? number * unit : undefined;
  };
  const text = (input: unknown): string | undefined =>
    typeof input === 'string' && input.trim() ? input : undefined;
  const measurements = Array.isArray(cpu.cpus) ? cpu.cpus.map(percentage) : [];
  const average =
    measurements.length && measurements.every((v) => v !== undefined)
      ? (measurements as number[]).reduce((sum, v) => sum + v, 0) / measurements.length
      : undefined;
  const coreCount = (input: unknown): number | undefined => {
    const number = nonnegative(input);
    return number !== undefined && number > 0 && Number.isInteger(number) ? number : undefined;
  };
  const cores = coreCount(raw.cpus) ?? coreCount(cpu.cores) ?? coreCount(os.numCpu);
  const disks = Array.isArray(raw.disks) ? raw.disks : Array.isArray(raw.disk) ? raw.disk : [];
  return {
    os: text(raw.os) ?? text(os.goos),
    arch: text(raw.arch) ?? text(os.arch),
    cpus: cores,
    cpuUsed: percentage(raw.cpuUsed) ?? average,
    memTotal: nonnegative(raw.memTotal) ?? bytes(ram.totalMb, 1024 ** 2),
    memUsed: nonnegative(raw.memUsed) ?? bytes(ram.usedMb, 1024 ** 2),
    disks: disks.map((value) => {
      const disk = asLoose(value);
      return {
        path: text(disk.path) ?? text(disk.mountPoint),
        total: nonnegative(disk.total) ?? bytes(disk.totalGb, 1024 ** 3),
        used: nonnegative(disk.used) ?? bytes(disk.usedGb, 1024 ** 3),
      };
    }),
    goVersion: text(raw.goVersion) ?? text(os.goVersion),
  };
}

// Internal implementation detail.
export function withID<T extends object>(
  row: T,
): T & { ID: number; CreatedAt?: string; UpdatedAt?: string } {
  const raw = row as Loose;
  const out = { ...row } as T & { ID: number; CreatedAt?: string; UpdatedAt?: string };
  out.ID = asNumber(raw.ID !== undefined ? raw.ID : raw.id);
  const createdAt = asOptionalString(raw.CreatedAt !== undefined ? raw.CreatedAt : raw.createdAt);
  if (createdAt !== undefined) out.CreatedAt = createdAt;
  const updatedAt = asOptionalString(raw.UpdatedAt !== undefined ? raw.UpdatedAt : raw.updatedAt);
  if (updatedAt !== undefined) out.UpdatedAt = updatedAt;
  return out;
}

// Internal implementation detail.
function normalizeMeta(meta: unknown): MenuMeta {
  const raw = asLoose(meta);
  const icon = asString(raw.icon);
  return {
    activeName: asOptionalString(raw.activeName),
    keepAlive: Boolean(raw.keepAlive),
    defaultMenu: Boolean(raw.defaultMenu),
    title: asString(raw.title),
    icon: icon === 'customer-gva' ? 'customer-gea' : icon,
    closeTab: Boolean(raw.closeTab),
    transitionType: asOptionalString(raw.transitionType),
  };
}

// Internal implementation detail.
export function normalizeMenu(node: unknown): MenuNode {
  const raw = asLoose(node);
  const id = asNumber(raw.ID !== undefined ? raw.ID : raw.id);
  const path = asString(raw.path);
  const name = asString(raw.name);
  const meta = normalizeMeta(raw.meta);
  const parameters: MenuParameter[] = Array.isArray(raw.parameters)
    ? raw.parameters.map((item) => withID(asLoose(item)) as unknown as MenuParameter)
    : [];
  return {
    ID: id,
    CreatedAt: asOptionalString(raw.CreatedAt !== undefined ? raw.CreatedAt : raw.createdAt),
    UpdatedAt: asOptionalString(raw.UpdatedAt !== undefined ? raw.UpdatedAt : raw.updatedAt),
    parentId: asNumber(raw.parentId),
    path,
    name,
    hidden: Boolean(raw.hidden),
    component: asString(raw.component),
    sort: asNumber(raw.sort),
    meta: { ...meta, title: menuTitle(name, path, meta.title) },
    children: Array.isArray(raw.children) ? raw.children.map(normalizeMenu) : [],
    parameters,
    menuBtn: Array.isArray(raw.menuBtn)
      ? raw.menuBtn.map((item) => withID(asLoose(item)) as unknown as MenuBtn)
      : undefined,
    menuId: raw.menuId !== undefined ? asNumber(raw.menuId) : id,
    btns:
      raw.btns !== null && typeof raw.btns === 'object' && !Array.isArray(raw.btns)
        ? (raw.btns as Record<string, number>)
        : {},
  };
}

// Internal implementation detail.
export function normalizeAuthority(a: unknown): SysAuthority {
  const raw = asLoose(a);
  return {
    ID: asNumber(raw.ID !== undefined ? raw.ID : raw.id),
    CreatedAt: asOptionalString(raw.CreatedAt !== undefined ? raw.CreatedAt : raw.createdAt),
    UpdatedAt: asOptionalString(raw.UpdatedAt !== undefined ? raw.UpdatedAt : raw.updatedAt),
    authorityId: asNumber(raw.authorityId),
    authorityName: asString(raw.authorityName),
    code: asString(raw.code ?? raw.authorityCode) || undefined,
    parentId: raw.parentId === null || raw.parentId === undefined ? null : asNumber(raw.parentId),
    dataAuthorityId: Array.isArray(raw.dataAuthorityId)
      ? raw.dataAuthorityId.map(normalizeAuthority)
      : [],
    children: Array.isArray(raw.children) ? raw.children.map(normalizeAuthority) : [],
    menus: Array.isArray(raw.menus) ? raw.menus : undefined,
    defaultRouter: asString(raw.defaultRouter),
  };
}

// Internal implementation detail.
export function normalizeUser(user: unknown): SysUser {
  const raw = asLoose(user);
  const hasAuthority = raw.authority !== null && typeof raw.authority === 'object';
  const authority = hasAuthority ? normalizeAuthority(raw.authority) : ({} as SysAuthority);
  const authorities = Array.isArray(raw.authorities)
    ? raw.authorities.map(normalizeAuthority)
    : hasAuthority
      ? [authority]
      : [];
  return {
    ID: asNumber(raw.ID !== undefined ? raw.ID : raw.id),
    CreatedAt: asOptionalString(raw.CreatedAt !== undefined ? raw.CreatedAt : raw.createdAt),
    UpdatedAt: asOptionalString(raw.UpdatedAt !== undefined ? raw.UpdatedAt : raw.updatedAt),
    uuid: asString(raw.uuid),
    userName: asString(raw.userName),
    nickName: asString(raw.nickName),
    headerImg: asString(raw.headerImg),
    authorityId: asNumber(raw.authorityId),
    authority,
    authorities,
    phone: asString(raw.phone),
    email: asString(raw.email),
    enable: asNumber(raw.enable) || 1,
    originSetting: (raw.originSetting ?? null) as SysUser['originSetting'],
  };
}
