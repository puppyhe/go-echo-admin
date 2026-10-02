// Chinese-only UI copy and normalization for labels stored by the server.
// The application has no language state or runtime locale switching.
type Messages = Record<string, string>;

export const zh: Messages = {
  login: '登录', welcome: '欢迎', security: '安全设置', tenantCode: '租户编码', continue: '继续', changeTenant: '切换租户', passwordLogin: '密码登录', username: '用户名', password: '密码', captcha: '验证码', refreshCaptcha: '刷新验证码', signIn: '登录', forgotPassword: '忘记密码？', platformLogin: '平台登录', deploy: '初始化部署', resetPassword: '重置密码', menuSearch: '搜索菜单', settings: '设置', logout: '退出登录', profile: '个人资料', refresh: '刷新', fullscreen: '全屏', theme: '主题', navigation: '导航', appearance: '外观', appearanceMode: '外观模式', primaryColor: '主题色', layout: '布局', layoutMode: '布局模式', sidebarWidth: '侧边栏宽度', light: '浅色', dark: '深色', system: '跟随系统', tenantSwitch: '切换租户', tenantWarning: '登录前请选择租户。', unsavedChanges: '未保存的页面修改将丢失，是否继续？', confirm: '确认', noMenu: '暂无菜单项', inputTenant: '请输入租户编码继续。', captchaConfig: '验证码配置不可用', loginSuccess: '登录成功', invalidUsername: '请输入有效的用户名', enterUsername: '请输入用户名', enterPassword: '请输入密码', enterCaptcha: '请输入验证码', getCaptcha: '获取验证码', unsupportedFullscreen: '当前环境不支持全屏', expand: '展开菜单', collapse: '收起菜单', searchPlaceholder: '按名称或路径搜索', normal: '标准', sidebar: '侧边栏', head: '顶部栏', combination: '混合布局', tabs: '标签页', size: '尺寸', small: '小', middle: '中', large: '大', width: '宽度', role: '角色', roleLabel: '角色', switchTo: '切换到', switchRole: '切换角色', currentTenant: '当前租户', enhancements: '增强功能', watermark: '水印', grayscale: '灰度模式', reduceColor: '降低色彩强度', resetDefaults: '恢复默认设置', page: '页面', tabActions: '标签页操作', closeCurrentTab: '关闭当前标签页', closeOtherTabs: '关闭其他标签页', closeTabsLeft: '关闭左侧标签页', closeTabsRight: '关闭右侧标签页', closeAllTabs: '关闭全部标签页', closeTab: '关闭标签页', records: '记录', actions: '操作', deleteSelected: '删除选中项', loading: '加载中', retry: '重试', save: '保存', cancel: '取消', create: '新建', edit: '编辑', preview: '预览', search: '搜索', reset: '重置', noData: '暂无数据', requestFailed: '请求失败', noAnnouncements: '暂无公告', noShortcuts: '暂无快捷入口', noModules: '暂无可用模块', tenantExample: '例如：acme', captchaAction: '验证码', administratorSignIn: '管理员登录',
};

// Menu names are stored in the server and may be English even when the UI is Chinese.
// Keep administrator-provided Chinese names unchanged, and translate the built-in names.
const menuTranslations: Record<string, string> = {
  Dashboard: '仪表盘', Products: '产品', Administration: '管理中心', Organization: '组织管理', Monitoring: '监控中心', Media: '媒体管理', Enterprise: '企业管理', 'AI workspace': 'AI 工作台', 'System settings': '系统设置', 'Workflow center': '流程中心', 'Notification center': '通知中心', 'Form center': '表单中心', 'System tools': '系统工具', Plugins: '插件管理', Profile: '个人资料', 'Roles and permissions': '角色与权限', 'Menu management': '菜单管理', 'API management': 'API 管理', API: 'API 管理', Users: '用户管理', Departments: '部门管理', Positions: '岗位管理', Dictionaries: '字典管理', 'System parameters': '系统参数', Security: '安全设置', 'Operation logs': '操作日志', 'Login logs': '登录日志', 'Error logs': '错误日志', 'Version management': '版本管理', 'Scheduled jobs': '定时任务', 'Server status': '服务器状态', 'Form designer': '表单设计', 'Export templates': '导出模板', About: '关于系统', Announcements: '公告管理', Email: '邮件管理', 'Pending tasks': '待办任务', 'Start workflow': '发起流程', 'Workflow instances': '流程实例', 'Workflow definitions': '流程定义', 'Workflow checkup': '流程检查', 'Workflow settings': '流程设置', Delegations: '委托任务', Inbox: '收件箱', 'Notification preferences': '通知偏好', 'Notification templates': '通知模板', 'Notification channels': '通知渠道', 'Notification deliveries': '通知投递', 'Notification configuration': '通知配置', Collaboration: '协作中心', Notifications: '通知管理', 'Purchase orders': '采购订单', Skills: '技能管理', 'Code generator': '代码生成', 'Package generator': '包生成器', 'Generated code': '生成代码', 'AI workflow': 'AI 工作流', 'Plugin manager': '插件管理', 'AI CLI': 'AI 命令行', 'AI page builder': 'AI 页面构建', 'Form management': '表单管理',
  dictionarydetails: '字典详情', 'Dictionary details': '字典详情',
  superAdmin: '管理中心', orgManagement: '组织管理', monitor: '监控中心', media: '媒体管理', enterprise: '企业管理',
  aiWorkshop: 'AI 工作台', systemSettings: '系统设置', flowCenter: '流程中心', notifyCenter: '通知中心', customFormCenter: '表单中心',
  systemTools: '系统工具', plugin: '插件管理', person: '个人资料', authority: '角色与权限', menu: '菜单管理', api: 'API 管理', user: '用户管理',
  dictionary: '字典管理', operation: '操作日志', loginLog: '登录日志', params: '系统参数', systemConfig: '系统配置', serverState: '服务器状态',
  apiToken: 'API 令牌', sysError: '错误日志', exportTemplate: '导出模板', sysVersion: '版本管理', skills: '技能管理', autoCode: '代码生成',
  autoPkg: '包生成器', autoCodeAdmin: '已生成代码', aiWorkflow: 'AI 工作流', 'plugin-mgr': '插件管理', anInfo: '公告管理', formCreate: '表单设计',
  enterpriseCollab: '协作中心', enterpriseNotifications: '通知管理', purchaseOrders: '采购订单', orgDepartments: '部门管理', orgPositions: '岗位管理',
  securityConfig: '安全设置', scheduledJobs: '定时任务', fileLogViewer: '文件日志', cliCollections: 'AI 命令行', aiPageBuilder: 'AI 页面构建',
  flowTodo: '待办任务', flowStart: '发起流程', flowInstances: '流程实例', flowDefinitions: '流程定义', flowCheckup: '流程检查', flowRuntime: '流程设置',
  flowDelegations: '委托任务', notifyInbox: '收件箱', notifyPreference: '通知偏好', notifyTemplate: '通知模板', notifyChannel: '通知渠道',
  notifyDelivery: '通知投递', notifyConfig: '通知配置', customFormManagement: '表单管理',
};
const uiTranslations: Record<string, string> = {
  actions: '操作', action: '操作', name: '名称', username: '用户名', nickname: '昵称', password: '密码', phone: '手机号', email: '邮箱', status: '状态', description: '描述', 'message=': '描述', message: '说明', 'message（message）': '金额', icon: '图标', routeName: '路由名称', routePath: '路由路径', parent: '父级菜单', parentId: '父级菜单', component: '页面组件', sort: '排序', hidden: '隐藏', enabled: '启用', disabled: '禁用', createdAt: '创建时间', createmessage: '创建时间', updatedAt: '更新时间', user: '用户', role: '角色', department: '部门', position: '岗位', address: '地址', title: '标题', content: '内容', type: '类型', code: '编码', encoding: '编码', value: '值', key: '键', nameencoding: '名称或编码', query: '查询', reset: '重置', create: '新建', edit: '编辑', delete: '删除', confirm: '确认', cancel: '取消', save: '保存', close: '关闭', refresh: '刷新', 'Message node': '菜单节点', 'Details node': '数据节点', 'route configuration': '路由配置', 'base information': '基本信息', 'Replace image': '图标', KeepAlive: '缓存页面', CloseTab: '关闭标签页', parameter: '参数', parameters: '参数', parametername: '参数名称', parametermessage: '参数值', parameterdescription: '参数描述', select: '选择', 'Please enter': '请输入', 'Please select': '请选择', 'No data': '暂无数据', records: '记录', 'Confirm delete': '确认删除',
};
zh.returnToSignIn = '返回登录';
zh.loadingTenant = '正在加载租户配置…';

// Page level copy used by the landing pages and the shared CRUD surface.
Object.assign(zh, {
  workspace: 'GO-ECHO-ADMIN 工作台', welcomeUser: '欢迎', accountWorkspace: '账户工作台',
  openProducts: '打开产品管理', openPurchaseOrders: '打开采购订单', openWorkflow: '打开流程中心', openWorkspace: '打开工作台',
  menuItems: '菜单项', availableToAccount: '当前账号可用', currentRole: '当前角色', permissionScope: '权限范围',
  announcements: '公告', unableToLoadAnnouncements: '公告加载失败', publishedAnnouncements: '已发布公告',
  workspaceModules: '工作台模块', noModulesAvailable: '暂无可用模块', loadingMenu: '正在加载菜单…', manageAnnouncements: '管理公告',
  requestFailedRetry: '请求失败，请点击"刷新"重试。', noAnnouncements: '暂无公告', release: '发布', shortcuts: '快捷入口', noShortcuts: '暂无快捷入口',
  account: '账户', nickname: '昵称', viewProject: '查看项目',
  projectDetails: '项目详情', managementConsole: '管理控制台', service: '服务', businessModules: '业务模块', documentation: '文档',
  capabilities: '功能概览', dataPermissions: '数据权限', dataPermissionsDescription: '控制用户和部门对数据的查看、编辑和导出权限。',
  approvalWorkflows: '审批流程', approvalWorkflowsDescription: '发起表单审批并跟踪处理状态。', dataManagement: '数据管理', dataManagementDescription: '在权限校验下管理字段、数据、导入和导出。',
  open: '打开', aboutWorkspace: '关于此工作台', aboutWorkspaceDescription: '登录后可管理用户、角色、菜单、采购订单、流程和审批。', aboutWorkspaceDetails: '用户、角色、部门、岗位、表单、文件和任务使用统一的权限模型。', aboutWorkspaceAudit: '配置变更会记录在操作日志中。',
  returnHome: '返回首页', pageNotFound: '页面不存在，或当前账号没有访问权限。', pageNotConfigured: '{page} 页面尚未配置。', pageRegistrationDetails: '页面注册信息',
  records: '记录', actions: '操作', query: '查询', reset: '重置', create: '新建', edit: '编辑', delete: '删除', confirmDelete: '确定删除这条记录吗？', deleteSelected: '删除选中项', refreshList: '刷新列表', totalRecords: '共 {count} 条记录',
  enabled: '启用', disabled: '禁用', enter: '请输入', select: '请选择', required: '为必填项', saved: '保存成功', created: '创建成功', deleted: '删除成功', productManagement: '产品管理', productManagementDescription: '搜索、新建、编辑和删除产品。', purchaseOrders: '采购订单', purchaseOrdersDescription: '管理采购订单、审批和导出。', workflowCenter: '流程中心', workflowCenterDescription: '创建流程并处理待办任务。', formManagement: '表单管理', formManagementDescription: '设计表单并管理已发布版本。', dataExport: '数据导出', dataExportDescription: '配置数据源和查询字段。', pageBuilder: '页面构建', pageBuilderDescription: '生成页面、预览数据并导出文件。', dashboards: '仪表盘', dashboardsDescription: '查看和配置仪表盘。', organization: '组织管理', organizationDescription: '管理用户、部门和岗位。', management: '管理', purchaseOrder: '采购订单', workflow: '流程', pendingTasks: '待办任务', notifications: '通知', codeGenerator: '代码生成', menuManagement: '菜单管理', apiManagement: 'API 管理',
});

function hasCjk(value: string): boolean { return /[㐀-鿿]/.test(value); }
function isPlaceholderMenuTitle(value: string): boolean { return /^(?:ai\s+)?description$/i.test(value.trim()); }
function readableMenuTitle(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}
export function translateMenuTitle(title: string, fallback = ''): string {
  let source = title?.trim() || '';
  if (isPlaceholderMenuTitle(source) || !source) source = fallback?.trim() || source;
  if (!source) return '';
  const normalized = source.replace(/\s+/g, ' ').toLowerCase();
  const match = Object.entries(menuTranslations).find(([key]) => key.toLowerCase() === normalized);
  if (match) return match[1];
  const readable = readableMenuTitle(source);
  const readableMatch = Object.entries(menuTranslations).find(([key]) => key.toLowerCase() === readable.toLowerCase());
  return readableMatch?.[1] || (hasCjk(source) ? source : readable);
}
export function translateUiText(value: string): string {
  if (!value) return value;
  const normalized = value.trim().replace(/\s+/g, ' ');
  const direct = uiTranslations[normalized] ?? uiTranslations[normalized.toLowerCase()];
  if (direct) return direct;
  // A number of older pages concatenate the action and field name without a
  // separator (for example `edit${name}` or `searchdepartment`). Translate
  // those rendered labels as well, including rows whose name is user supplied.
  const action = normalized.match(/^(edit|delete|create|add|refresh|search|select|enable|disable)(.+)$/i);
  if (action) {
    const actionText: Record<string, string> = {
      edit: '编辑', delete: '删除', create: '新建', add: '新增', refresh: '刷新',
      search: '搜索', select: '请选择', enable: '启用', disable: '禁用',
    };
    const tail = translateUiText(action[2]);
    return `${actionText[action[1].toLowerCase()] ?? action[1]}${tail}`;
  }
  const defaultProfile = normalized.match(/^default:\s*(.+)$/i);
  if (defaultProfile) return `默认：${defaultProfile[1]}`;
  if (hasCjk(value)) return value;
  return value
    .replace(/^Please enter\s*/i, '请输入')
    .replace(/^Please select\s*/i, '请选择')
    .replace(/^select\s*/i, '请选择')
    .replace(/^message\s*/i, '说明');
}
