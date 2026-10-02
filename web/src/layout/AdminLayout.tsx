import { logout as closeBusinessSession } from '../services/authService';
import { AuthenticatedAvatar } from '../features/upload/AuthenticatedAsset';
// Responsive navigation layouts, account actions and appearance settings.
import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Avatar,
  Breadcrumb,
  Button,
  ColorPicker,
  ConfigProvider,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Menu,
  Modal,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tooltip,
  Watermark,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowRightOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  DownOutlined,
  FullscreenOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { fileUrl, session } from '../api/request';
import { userApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useMenu } from '../menu/MenuContext';
import { formatMenuTitle, matchingMenus } from '../menu/menuPaths';
import { menuToNavigation, type NavMenuItem } from './menuToNavigation';
import { useAppearance } from './AppearanceContext';
import TabsBar from './TabsBar';
import CachedOutlet from './CachedOutlet';
import NotificationBell from './NotificationBell';
import { translateMenuTitle, zh } from '../locale/zh';
// This shell is Chinese-only.

const external = /^https?:\/\//i;
function menuItems(items: NavMenuItem[]): MenuProps['items'] {
  return items.map((item) => ({
    key: item.path,
    label: external.test(item.path) ? (
      <a href={item.path} target="_blank" rel="noreferrer">
        {item.name}
      </a>
    ) : (
      item.name
    ),
    icon: item.icon,
    children: item.children ? menuItems(item.children) : undefined,
  }));
}

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const menu = useMenu();
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const menuTitle = translateMenuTitle;
  const { config, dark, update, reset } = useAppearance();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('gea-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [groupPath, setGroupPath] = useState('');
  const [switching, setSwitching] = useState(false);
  const tenant = session.getTenant();
  const displayName =
    user?.nickName && user.nickName !== 'Description' ? user.nickName : (user?.userName ?? '');
  const displayRole =
    user?.authority?.authorityName && user.authority.authorityName !== 'Description'
      ? user.authority.authorityName
      : String(user?.authorityId ?? '');
  const navigation = useMemo(() => menuToNavigation(menu.tree, ''), [menu.tree]);
  const matched = matchingMenus(menu.nodeByPath, location.pathname);
  const currentNode = matched.at(-1)?.[1];
  const activePath =
    (currentNode?.meta.activeName && menu.pathOf(currentNode.meta.activeName)) ||
    matched.at(-1)?.[0] ||
    location.pathname;
  const containsActive = (item: NavMenuItem): boolean =>
    item.path === activePath || item.children?.some(containsActive) === true;
  const activeGroup = navigation.find(containsActive);
  const group = navigation.find((item) => item.path === groupPath) || activeGroup || navigation[0];
  const split = !mobile && (config.sideMode === 'combination' || config.sideMode === 'sidebar');
  const sideItems = split ? group?.children || (group ? [group] : []) : navigation;
  const showSide = mobile || config.sideMode !== 'head';
  const width = mobile ? 256 : collapsed ? 80 : config.sideWidth;
  useEffect(() => {
    try {
      localStorage.setItem('gea-sidebar-collapsed', String(collapsed));
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [collapsed]);
  useEffect(() => {
    setGroupPath(activeGroup?.path || '');
    setOpenKeys(matched.slice(0, -1).map(([path]) => path));
    setMobileOpen(false);
  }, [location.pathname, menu.tree]);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const visit = (path: string) => {
    if (external.test(path)) return;
    const node = menu.nodeByPath.get(path);
    const params = new URLSearchParams();
    node?.parameters?.filter((p) => p.type === 'query').forEach((p) => params.set(p.key, p.value));
    let target = path;
    node?.parameters
      ?.filter((p) => p.type === 'params')
      .forEach((p) => {
        target = target.replace(`:${p.key}`, encodeURIComponent(p.value));
      });
    navigate(`${target}${params.size ? `?${params}` : ''}`);
    setSearchOpen(false);
  };
  const switchAuthority = async (authorityId: number) => {
    if (!user || switching) return;
    setSwitching(true);
    try {
      await userApi.setUserAuthority({ ID: user.ID, authorityId });
      sessionStorage.removeItem(session.storageKey('gea-tabs'));
      window.location.assign('/');
    } catch {
      setSwitching(false);
    }
  };
  if (!loading && !session.isAuthenticated())
    return (
      <Navigate
        to={session.loginURL()}
        replace
        state={{ from: location.pathname + location.search, tenantCode: tenant?.code }}
      />
    );
  if (loading || !menu.ready)
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (location.pathname === '/')
    return (
      <Navigate
        to={
          menu.resolveLandingPath(user.authority?.defaultRouter) === '/'
            ? '/404'
            : menu.resolveLandingPath(user.authority?.defaultRouter)
        }
        replace
      />
    );
  const searchResults = [...menu.nodeByPath.entries()].filter(
    ([, node]) =>
      !node.hidden &&
      !node.children?.length &&
      `${node.meta.title} ${node.name} ${node.path}`.toLowerCase().includes(query.toLowerCase()),
  );
  const routeWorkspace = (
    <div className="route-page">
      <CachedOutlet key={session.cacheKey()} revision={revision} />
    </div>
  );
  const sidebar = (
    <>
      {config.sideMode === 'sidebar' && !mobile && (
        <div className="group-rail">
          {navigation.map((item) => (
            <Tooltip key={item.path} title={item.name} placement="right">
              <button
                className={group?.path === item.path ? 'active' : ''}
                onClick={() => {
                  setGroupPath(item.path);
                  if (!item.children) visit(item.path);
                }}
              >
                {item.icon}
                <span>{item.name}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      <aside
        className={`admin-sidebar${collapsed && !mobile ? ' is-collapsed' : ''}`}
        style={{ width }}
      >
        <nav className="sidebar-navigation" aria-label="主导航">
          <ConfigProvider
            theme={{
              components: {
                Menu: {
                  itemHeight: 46,
                  itemMarginInline: 10,
                  itemMarginBlock: 3,
                  itemBorderRadius: 8,
                  subMenuItemBorderRadius: 8,
                  iconSize: 18,
                  collapsedIconSize: 20,
                  iconMarginInlineEnd: 10,
                  itemColor: dark ? '#cbd5e1' : '#303744',
                  subMenuItemSelectedColor: dark ? '#cbd5e1' : '#303744',
                  itemHoverColor: config.primaryColor,
                  itemHoverBg: dark ? '#1e293b' : '#f3f6fa',
                  itemSelectedColor: '#ffffff',
                  itemSelectedBg: config.primaryColor,
                  subMenuItemBg: 'transparent',
                  activeBarWidth: 0,
                },
              },
            }}
          >
            <Menu
              className="sidebar-menu"
              mode="inline"
              inlineIndent={20}
              inlineCollapsed={!mobile && collapsed}
              selectedKeys={[activePath]}
              openKeys={mobile || !collapsed ? openKeys : undefined}
              onOpenChange={setOpenKeys}
              items={menuItems(sideItems)}
              onClick={({ key }) => visit(key)}
            />
          </ConfigProvider>
        </nav>
        {!mobile && (
          <Button
            className="sidebar-collapse"
            type="text"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!collapsed}
            icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
            onClick={() => setCollapsed((prev) => !prev)}
          />
        )}
      </aside>
    </>
  );
  return (
    <div className="admin-shell">
      <header className="admin-header">
        {mobile && (
          <Button
            type="text"
            aria-label={zh['navigation']}
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
          />
        )}
        <button
          className={`admin-brand${collapsed && !mobile ? ' is-collapsed' : ''}`}
          onClick={() => navigate('/')}
        >
          <img src="/logo.png" alt="Go-Echo-Admin" />
          {!mobile && !collapsed && <span>Go-Echo-Admin</span>}
        </button>
        {!mobile &&
          (config.sideMode === 'head' || config.sideMode === 'combination' ? (
            <Menu
              className="header-menu"
              mode="horizontal"
              selectedKeys={[config.sideMode === 'combination' ? group?.path || '' : activePath]}
              items={menuItems(
                config.sideMode === 'combination'
                  ? navigation.map((item) => ({ ...item, children: undefined }))
                  : navigation,
              )}
              onClick={({ key }) => {
                if (config.sideMode === 'combination') {
                  setGroupPath(key);
                  const item = navigation.find((n) => n.path === key);
                  if (!item?.children) visit(key);
                } else visit(key);
              }}
            />
          ) : (
            <Breadcrumb
              className="admin-breadcrumb"
              items={matched.map(([path, node]) => ({
                title: (
                  <a onClick={() => visit(path)}>
                    {menuTitle(
                      formatMenuTitle(node.meta.title, path, location.pathname, location.search),
                      node.name || path,
                    )}
                  </a>
                ),
              }))}
            />
          ))}
        <Space className="header-tools" size={mobile ? 4 : 10}>
          {tenant && (
            <Tooltip title={`${zh['currentTenant']}: ${tenant.name} (${tenant.code})`}>
              <span
                className="tenant-pill"
                style={{
                  maxWidth: mobile ? 90 : 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tenant.name}
              </span>
            </Tooltip>
          )}
          <Tooltip title={`${zh['menuSearch']} ⌘ / Ctrl K`}>
            <Button
              shape="circle"
              aria-label={zh['menuSearch']}
              icon={<SearchOutlined />}
              onClick={() => {
                setQuery('');
                setSearchOpen(true);
              }}
            />
          </Tooltip>
          <NotificationBell />
          <Tooltip title={zh['settings']}>
            <Button
              shape="circle"
              aria-label={zh['settings']}
              icon={<SettingOutlined />}
              onClick={() => setSettingsOpen(true)}
            />
          </Tooltip>
          {!mobile && (
            <Tooltip title={zh['refresh']}>
              <Button
                shape="circle"
                aria-label={zh['refresh']}
                icon={<ReloadOutlined />}
                onClick={() => setRevision((prev) => prev + 1)}
              />
            </Tooltip>
          )}
          <Tooltip title={zh['theme']}>
            <Button
              shape="circle"
              aria-label={zh['theme']}
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => update({ darkMode: dark ? 'light' : 'dark' })}
            />
          </Tooltip>
          {!mobile && (
            <Tooltip title={zh['fullscreen']}>
              <Button
                shape="circle"
                aria-label={zh['fullscreen']}
                icon={<FullscreenOutlined />}
                onClick={() => {
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen()
                  ).catch(() => message.info(zh['unsupportedFullscreen']));
                }}
              />
            </Tooltip>
          )}
          <Dropdown
            menu={{
              items: [
                ...(tenant
                  ? [
                      {
                        key: 'tenant',
                        label: `${zh['currentTenant']}: ${tenant.name} (${tenant.code})`,
                        disabled: true,
                      },
                      {
                        key: 'switch-tenant',
                        label: zh['tenantSwitch'],
                        onClick: () =>
                          Modal.confirm({
                            title: zh['tenantSwitch'],
                            content: zh['unsavedChanges'],
                            okText: zh['confirm'],
                            onOk: async () => {
                              await closeBusinessSession();
                              session.selectTenant(null);
                              window.location.assign('/login');
                            },
                          }),
                      },
                    ]
                  : []),
                {
                  key: 'role',
                  label: `${zh['roleLabel']}: ${displayRole}`,
                  disabled: true,
                },
                ...(user.authorities || [])
                  .filter((item) => item.authorityId !== user.authorityId)
                  .map((item) => ({
                    key: `role-${item.authorityId}`,
                    label: `${zh['switchRole']}: ${item.authorityName}`,
                    disabled: switching,
                    onClick: () => {
                      void switchAuthority(item.authorityId);
                    },
                  })),
                { type: 'divider' },
                {
                  key: 'person',
                  label: zh['profile'],
                  icon: <UserOutlined />,
                  onClick: () => navigate(menu.pathOf('person') || '/person'),
                },
                {
                  key: 'logout',
                  label: zh['logout'],
                  icon: <LogoutOutlined />,
                  onClick: () => {
                    void logout();
                  },
                },
              ],
            }}
          >
            <button className="user-dropdown">
              <AuthenticatedAvatar size={32} src={user.headerImg} icon={<UserOutlined />} />
              {!mobile && <span>{displayName}</span>}
              <DownOutlined />
            </button>
          </Dropdown>
        </Space>
      </header>
      <div className="admin-body">
        {!mobile && showSide && sidebar}
        <main className="admin-main">
          {config.showTabs && <TabsBar onRefresh={() => setRevision((prev) => prev + 1)} />}
          <div className="admin-scroll">
            {config.watermark ? (
              <Watermark
                className="admin-workspace"
                content={displayName}
                font={{ color: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)' }}
              >
                {routeWorkspace}
              </Watermark>
            ) : (
              <div className="admin-workspace">{routeWorkspace}</div>
            )}
          </div>
        </main>
      </div>
      <Drawer
        open={mobileOpen}
        title={zh['navigation']}
        placement="left"
        width={280}
        onClose={() => setMobileOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        {sidebar}
      </Drawer>
      <Modal
        title={zh['menuSearch']}
        open={searchOpen}
        onCancel={() => setSearchOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Input
          autoFocus
          size="large"
          prefix={<SearchOutlined />}
          placeholder={zh['searchPlaceholder']}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={() => {
            if (searchResults[0]) visit(searchResults[0][0]);
          }}
        />
        <div className="menu-search-results">
          {searchResults.length ? (
            searchResults.map(([path, node]) => (
              <button key={path} onClick={() => visit(path)}>
                <span>{menuTitle(node.meta.title || '', node.name || path)}</span>
                <small>{path}</small>
                <ArrowRightOutlined />
              </button>
            ))
          ) : (
            <Empty description={zh['noMenu']} />
          )}
        </div>
      </Modal>
      <Drawer
        title={zh['settings']}
        width={380}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      >
        <div className="appearance-settings">
          <h3>{zh['appearance']}</h3>
          <label>
            {zh['appearanceMode']}
            <Segmented
              value={config.darkMode}
              options={[
                { label: zh['light'], value: 'light' },
                { label: zh['dark'], value: 'dark' },
                { label: zh['system'], value: 'auto' },
              ]}
              onChange={(v) => update({ darkMode: v as typeof config.darkMode })}
            />
          </label>
          <label>
            {zh['primaryColor']}
            <ColorPicker
              value={config.primaryColor}
              onChangeComplete={(v) => update({ primaryColor: v.toHexString() })}
              showText
            />
          </label>
          <h3>{zh['layout']}</h3>
          <label>
            {zh['layoutMode']}
            <Select
              value={config.sideMode}
              style={{ width: 150 }}
              options={[
                { label: zh['normal'], value: 'normal' },
                { label: zh['sidebar'], value: 'sidebar' },
                { label: zh['head'], value: 'head' },
                { label: zh['combination'], value: 'combination' },
              ]}
              onChange={(sideMode) => update({ sideMode })}
            />
          </label>
          <label>
            {zh['sidebarWidth']}
            <span>{config.sideWidth}px</span>
          </label>
          <Slider
            min={200}
            max={320}
            value={config.sideWidth}
            onChange={(sideWidth) => update({ sideWidth })}
          />
          <label>
            {zh['tabs']}
            <Switch checked={config.showTabs} onChange={(showTabs) => update({ showTabs })} />
          </label>
          <label>
            {zh['size']}
            <Segmented
              value={config.size}
              options={[
                { label: zh['small'], value: 'small' },
                { label: zh['middle'], value: 'middle' },
                { label: zh['large'], value: 'large' },
              ]}
              onChange={(size) => update({ size: size as typeof config.size })}
            />
          </label>
          <h3>{zh['enhancements']}</h3>
          <label>
            {zh['watermark']}
            <Switch checked={config.watermark} onChange={(watermark) => update({ watermark })} />
          </label>
          <label>
            {zh['grayscale']}
            <Switch checked={config.grey} onChange={(grey) => update({ grey })} />
          </label>
          <label>
            {zh['reduceColor']}
            <Switch checked={config.weakness} onChange={(weakness) => update({ weakness })} />
          </label>
          <Button block onClick={reset}>
            {zh['resetDefaults']}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
