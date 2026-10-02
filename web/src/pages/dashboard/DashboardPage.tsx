// Account workspace: authorized navigation, current identity, and published announcements.
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  MonitorOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuth } from '../../auth/AuthContext';
import { useMenu } from '../../menu/MenuContext';
import { announcementApi, systemApi } from '../../api/endpoints';
import { zh } from '../../locale/zh';

type Announcement = Awaited<ReturnType<typeof announcementApi.getInfoPublic>>[number];
const modules = [
  {
    names: ['products'],
    titleKey: 'productManagement',
    descriptionKey: 'productManagementDescription',
    icon: <AppstoreOutlined />,
  },
  {
    names: ['purchaseOrders'],
    titleKey: 'purchaseOrders',
    descriptionKey: 'purchaseOrdersDescription',
    icon: <ShoppingCartOutlined />,
  },
  {
    names: ['flowTodo', 'enterpriseCollab'],
    titleKey: 'workflowCenter',
    descriptionKey: 'workflowCenterDescription',
    icon: <ApartmentOutlined />,
  },
  {
    names: ['customFormManagement'],
    titleKey: 'formManagement',
    descriptionKey: 'formManagementDescription',
    icon: <FileTextOutlined />,
  },
  {
    names: [],
    titleKey: 'dataExport',
    descriptionKey: 'dataExportDescription',
    icon: <DatabaseOutlined />,
  },
  {
    names: [],
    titleKey: 'pageBuilder',
    descriptionKey: 'pageBuilderDescription',
    icon: <FileTextOutlined />,
  },
  {
    names: ['visualDashboards'],
    titleKey: 'dashboards',
    descriptionKey: 'dashboardsDescription',
    icon: <AppstoreOutlined />,
  },
  {
    names: ['orgDepartments', 'user'],
    titleKey: 'organization',
    descriptionKey: 'organizationDescription',
    icon: <TeamOutlined />,
  },
];
const shortcuts = [
  { name: 'products', titleKey: 'management' },
  { name: 'purchaseOrders', titleKey: 'purchaseOrder' },
  { name: 'flowStart', titleKey: 'workflow' },
  { name: 'flowTodo', titleKey: 'pendingTasks' },
  { name: 'notifyInbox', titleKey: 'notifications' },
  { name: 'autoCode', titleKey: 'codeGenerator' },
  { name: 'menu', titleKey: 'menuManagement' },
  { name: 'api', titleKey: 'apiManagement' },
];
export default function DashboardPage() {
  const { user } = useAuth();
  const menu = useMenu();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [serverInfo, setServerInfo] = useState<Awaited<
    ReturnType<typeof systemApi.getServerInfo>
  > | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void announcementApi
      .getInfoPublic()
      .then((items) => {
        if (active) setAnnouncements(items);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setAnnouncements([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    let active = true;
    setServerLoading(true);
    void systemApi
      .getServerInfo()
      .then((info) => {
        if (active) setServerInfo(info);
      })
      .catch(() => {
        if (active) setServerInfo(null);
      })
      .finally(() => {
        if (active) setServerLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const entries = modules
    .map((item) => ({ ...item, path: item.names.map(menu.pathOf).find(Boolean) }))
    .filter((item) => item.path);
  const roleName =
    user?.authority?.authorityName && user.authority.authorityName !== 'Description'
      ? user.authority.authorityName
      : user?.authorityId
        ? `角色 ${user.authorityId}`
        : zh['role'];
  const displayName =
    user?.nickName && user.nickName !== 'Description'
      ? user.nickName
      : user?.userName && user.userName !== 'Description'
        ? user.userName
        : zh['administratorSignIn'];
  const purchasePath = menu.pathOf('purchaseOrders');
  const productPath = menu.pathOf('products');
  const flowStartPath = menu.pathOf('flowStart');
  const primary = productPath || purchasePath || flowStartPath || entries[0]?.path;
  const profilePath = menu.pathOf('person');
  const serverStatus = serverLoading ? '加载中' : serverInfo ? '运行正常' : '暂不可用';
  return (
    <div className="dashboard-page">
      <section className="dashboard-welcome">
        <div>
          <small>{zh['workspace']}</small>
          <h1>
            {zh['welcomeUser']}，{displayName}
          </h1>
          <p>
            {dayjs().format('YYYY-MM-DD')} · {zh['accountWorkspace']}
          </p>
        </div>
        <Space wrap>
          {primary && (
            <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate(primary)}>
              {productPath
                ? zh['openProducts']
                : purchasePath
                  ? zh['openPurchaseOrders']
                  : flowStartPath
                    ? zh['openWorkflow']
                    : zh['openWorkspace']}
            </Button>
          )}
          {profilePath && (
            <Button icon={<UserOutlined />} onClick={() => navigate(profilePath)}>
              个人中心
            </Button>
          )}
        </Space>
      </section>
      <div className="dashboard-stats">
        <Card className="dashboard-stat">
          <span className="dashboard-stat-icon" aria-hidden="true">
            <AppstoreOutlined />
          </span>
          <strong>{zh['menuItems']}</strong>
          <div className="dashboard-stat-value">{menu.ready ? menu.nameToNode.size : '—'}</div>
          <Typography.Text type="secondary">{zh['availableToAccount']}</Typography.Text>
          <div className="dashboard-stat-trend">
            <span>已授权菜单</span>
            <span className="dashboard-stat-spark spark-blue" />
          </div>
        </Card>
        <Card className="dashboard-stat">
          <span className="dashboard-stat-icon" aria-hidden="true">
            <SafetyCertificateOutlined />
          </span>
          <strong>{zh['currentRole']}</strong>
          <div className="dashboard-stat-value gea-role-value">{roleName}</div>
          <Typography.Text type="secondary">{zh['permissionScope']}</Typography.Text>
          <div className="dashboard-stat-trend">
            <span>权限范围</span>
            <span className="dashboard-stat-spark spark-violet" />
          </div>
        </Card>
        <Card className="dashboard-stat">
          <span className="dashboard-stat-icon" aria-hidden="true">
            <NotificationOutlined />
          </span>
          <strong>{zh['announcements']}</strong>
          <div className="dashboard-stat-value">
            {loading || failed ? '—' : announcements.length}
          </div>
          <Typography.Text type="secondary">
            {failed ? zh['unableToLoadAnnouncements'] : zh['publishedAnnouncements']}
          </Typography.Text>
          <div className="dashboard-stat-trend">
            <span>最近发布</span>
            <span className="dashboard-stat-spark spark-cyan" />
          </div>
        </Card>
        <Card className="dashboard-stat">
          <span className="dashboard-stat-icon" aria-hidden="true">
            <MonitorOutlined />
          </span>
          <strong>服务状态</strong>
          <div className="dashboard-stat-value dashboard-status-value">
            {serverLoading ? <Skeleton.Input active size="small" /> : serverInfo ? '正常' : '—'}
          </div>
          <Typography.Text type={serverInfo ? 'secondary' : 'danger'}>
            {serverInfo?.cpuUsed !== undefined
              ? `CPU ${Math.round(serverInfo.cpuUsed)}% · ${serverInfo.goVersion || '服务端'}`
              : serverStatus}
          </Typography.Text>
          <div className="dashboard-stat-trend">
            <span>实时服务监控</span>
            <span className="dashboard-stat-spark spark-green" />
          </div>
        </Card>
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <Card title={zh['workspaceModules']} extra={<Tag color="blue">按权限显示</Tag>}>
            {entries.length ? (
              <div className="gea-workspace-grid">
                {entries.map((entry) => (
                  <button
                    type="button"
                    // Titles are localized display strings and are not unique
                    // (several modules intentionally share one label). Use the
                    // resolved route as the stable React identity instead.
                    key={entry.path}
                    className="gea-workspace-entry"
                    onClick={() => navigate(entry.path!)}
                  >
                    <span className="gea-workspace-icon">{entry.icon}</span>
                    <span>
                      <strong>{zh[entry.titleKey]}</strong>
                      <p>{zh[entry.descriptionKey]}</p>
                    </span>
                    <ArrowRightOutlined />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={menu.ready ? zh['noModulesAvailable'] : zh['loadingMenu']}
              />
            )}
          </Card>
          <Card
            title={
              <Space>
                <NotificationOutlined />
                {zh['announcements']}
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={() => setReload((value) => value + 1)}
                >
                  {zh['refresh']}
                </Button>
                {menu.pathOf('anInfo') && (
                  <Button type="link" size="small" onClick={() => navigate(menu.pathOf('anInfo')!)}>
                    {zh['manageAnnouncements']}
                  </Button>
                )}
              </Space>
            }
          >
            {failed && (
              <Alert
                type="warning"
                showIcon
                message="公告暂时无法加载"
                description="可以点击右上角刷新按钮重试，其他工作台功能不受影响。"
                style={{ marginBottom: 12 }}
              />
            )}
            <List
              loading={loading}
              dataSource={announcements.slice(0, 6)}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={failed ? zh['requestFailedRetry'] : zh['noAnnouncements']}
                  />
                ),
              }}
              renderItem={(item, index) => (
                <List.Item key={`${item.ID}:${item.CreatedAt || ''}:${index}`}>
                  <List.Item.Meta
                    title={item.title}
                    description={
                      item.CreatedAt
                        ? dayjs(item.CreatedAt).format('YYYY-MM-DD HH:mm')
                        : zh['release']
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </div>
        <div className="dashboard-secondary">
          <Card title={zh['shortcuts']}>
            <div className="dashboard-shortcuts">
              {shortcuts
                .filter((item) => menu.pathOf(item.name))
                .map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    onClick={() => navigate(menu.pathOf(item.name)!)}
                  >
                    <span>
                      <ArrowRightOutlined />
                    </span>
                    {zh[item.titleKey]}
                  </button>
                ))}
            </div>
            {!shortcuts.some((item) => menu.pathOf(item.name)) && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={zh['noShortcuts']} />
            )}
          </Card>
          <Card title={zh['account']}>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'username', label: zh['username'], children: user?.userName || '—' },
                { key: 'nickname', label: zh['nickname'], children: displayName },
                { key: 'role', label: zh['role'], children: roleName },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
