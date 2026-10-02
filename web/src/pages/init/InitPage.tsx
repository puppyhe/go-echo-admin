// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Deployment guidance for the tenant platform and tenant provisioning process.
import { App, Button, ConfigProvider, theme } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CopyOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PRIMARY_COLOR } from '../../layout/theme';
import './InitPage.css';

// Public, non-secret keys from the server's dotenv template. Actual credentials stay on the server.
const configurationExample = `APP_ENV=development
ECHO_ADMIN_SERVER_ADDRESS=:8080
ECHO_ADMIN_SERVER_ALLOWED_ORIGINS=http://localhost:5173
ECHO_ADMIN_DATABASE_DRIVER=mysql
ECHO_ADMIN_DATABASE_HOST=127.0.0.1
ECHO_ADMIN_DATABASE_PORT=3306
ECHO_ADMIN_DATABASE_NAME=echo_admin
ECHO_ADMIN_DATABASE_USER=echo_admin
ECHO_ADMIN_AUTH_ACCESS_TTL=15m
ECHO_ADMIN_AUTH_REFRESH_TTL=168h
ECHO_ADMIN_DEMO_ENABLED=false`;

export default function InitPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const copyConfiguration = async () => {
    try {
      await navigator.clipboard.writeText(configurationExample);
      message.success('配置信息已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <ConfigProvider
      theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: DEFAULT_PRIMARY_COLOR } }}
    >
      <main className="init-page">
        <header className="init-header">
          <div className="init-container init-header-inner">
            <div className="init-brand">
              <img src="/logo.png" alt="" aria-hidden="true" width={32} height={36} />
              <strong>go-echo-admin</strong>
              <span>部署指南</span>
            </div>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/login')}>
              返回登录
            </Button>
          </div>
        </header>
        <div className="init-container init-content">
          <section className="init-intro" aria-labelledby="init-title">
            <div>
              <p className="init-eyebrow">多租户部署</p>
              <h1 id="init-title">初始化部署</h1>
              <p className="init-subtitle">配置数据库与平台密钥，启动服务并创建第一个租户。</p>
            </div>
            <nav className="init-nav" aria-label="页面导航">
              <a href="#deployment-steps">部署步骤</a>
              <a href="#configuration-example">配置示例</a>
              <a href="#automatic-migration">数据迁移</a>
            </nav>
          </section>
          <aside className="init-notice" aria-label="部署须知">
            <InfoCircleOutlined aria-hidden="true" />
            <div>
              <strong>部署须知</strong>
              <p>
                本页面指导后端服务的首次部署；请先完成数据库初始化并确认账号具备建表权限。
                配置保存后即可启动服务，租户的创建与管理都在本页面完成后的管理控制台中进行。
              </p>
            </div>
          </aside>
          <div className="init-columns">
            <section
              id="deployment-steps"
              className="init-panel init-steps-panel"
              aria-labelledby="deployment-title"
            >
              <div className="init-section-heading">
                <h2 id="deployment-title">部署步骤</h2>
                <p>按顺序完成以下四步配置</p>
              </div>
              <ol className="init-steps">
                <li>
                  <span className="init-step-number" aria-hidden="true">
                    01
                  </span>
                  <div className="init-step-content">
                    <h3>数据库配置</h3>
                    <p>
                      在项目根目录执行 <code>go run ./cmd/echo-admin init</code> 生成被忽略的
                      <code>.env</code>，按环境填写数据库连接，并确保数据库账号拥有建表权限。
                    </p>
                  </div>
                </li>
                <li>
                  <span className="init-step-number" aria-hidden="true">
                    02
                  </span>
                  <div className="init-step-content">
                    <h3>关键配置项</h3>
                    <p>以下配置与平台安全相关，请在生产环境中逐一替换：</p>
                    <dl className="init-credentials">
                      <div>
                        <dt>
                          <code>ECHO_ADMIN_DATABASE_PASSWORD</code>
                        </dt>
                        <dd>MySQL 密码；也可以使用 ECHO_ADMIN_DATABASE_DSN 连接串</dd>
                      </div>
                      <div>
                        <dt>
                          <code>ECHO_ADMIN_AUTH_JWT_SECRET</code>
                        </dt>
                        <dd>JWT 签名密钥，长度至少 32 个字符，由 init 自动生成</dd>
                      </div>
                      <div>
                        <dt>
                          <code>ECHO_ADMIN_ADMIN_PASSWORD</code>
                        </dt>
                        <dd>仅用于 seed 创建首个管理员，生产通过秘密管理系统注入</dd>
                      </div>
                      <div>
                        <dt>
                          <code>ECHO_ADMIN_SERVER_ALLOWED_ORIGINS</code>
                        </dt>
                        <dd>逗号分隔的浏览器来源，生产禁止使用通配符</dd>
                      </div>
                      <div>
                        <dt>
                          <code>APP_ENV</code>
                        </dt>
                        <dd>仅允许 development 或 production；生产会关闭演示配置</dd>
                      </div>
                    </dl>
                  </div>
                </li>
                <li>
                  <span className="init-step-number" aria-hidden="true">
                    03
                  </span>
                  <div className="init-step-content">
                    <h3>启动服务</h3>
                    <p>
                      执行 <code>docker compose up -d</code> 启动 MySQL、Redis、后端和参考前端；
                      也可在主机上运行 <code>make dev</code>。后端启动失败时请查看配置与数据库日志。
                    </p>
                    <p>
                      使用 <code>go run ./cmd/echo-admin migrate</code> 应用迁移，
                      再通过 <code>ECHO_ADMIN_ADMIN_PASSWORD=...</code> 执行 seed。
                    </p>
                  </div>
                </li>
                <li>
                  <span className="init-step-number" aria-hidden="true">
                    04
                  </span>
                  <div className="init-step-content">
                    <h3>平台登录</h3>
                    <p>
                      访问 <code>/login</code>，使用 seed 创建的管理员登录。登录后可选择当前租户，
                      并通过权限中心管理成员、角色、菜单和 API 资源。
                    </p>
                    <p className="init-step-note">
                      租户创建完成后会生成登录链接，请复制并分发给租户管理员。
                      租户管理员使用初始化时设置的密码登录后即可管理业务数据。
                    </p>
                  </div>
                </li>
              </ol>
            </section>
            <aside
              id="configuration-example"
              className="init-panel init-config-panel"
              aria-labelledby="configuration-title"
            >
              <div className="init-section-heading">
                <h2 id="configuration-title">配置示例</h2>
                <p>以下是公开的非敏感配置；数据库密码等敏感项请按实际环境填写。</p>
              </div>
              <div className="init-code-header">
                <span>
                  .env <span className="init-code-language">dotenv</span>
                </span>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void copyConfiguration()}
                >
                  复制
                </Button>
              </div>
              <pre className="init-code">
                <code>{configurationExample}</code>
              </pre>
              <div className="init-config-note">
                <InfoCircleOutlined aria-hidden="true" />
                <p>
                  修改配置后需重启服务生效；配置采用 <code>ECHO_ADMIN_SECTION_FIELD=value</code>
                  命名，程序会从 <code>.env</code>、环境变量和 CLI 参数按优先级加载。
                </p>
              </div>
            </aside>
          </div>
          <section
            id="automatic-migration"
            className="init-panel init-migration"
            aria-labelledby="migration-title"
          >
            <div className="init-section-heading">
              <h2 id="migration-title">数据迁移</h2>
              <p>首次启动时自动完成建表与初始数据写入</p>
            </div>
            <div className="init-migration-grid">
              <div>
                <h3>自动迁移</h3>
                <p>
                  服务启动和 <code>echo-admin migrate</code> 使用同一迁移服务创建表结构；
                  数据库不可用或迁移失败时服务拒绝启动。
                </p>
              </div>
              <div>
                <h3>版本迁移</h3>
                <p>
                  数据结构变更需提交版本化迁移并在 MySQL 集成环境验证，
                  不要依赖生产环境自动删除字段。
                </p>
              </div>
              <div>
                <h3>数据库支持</h3>
                <p>
                  服务统一使用 MySQL，配置与隔离规则见
                  <code>docs/configuration.md</code> 和 <code>docs/echo-admin-prd.md</code>。
                </p>
              </div>
            </div>
          </section>
          <footer className="init-footer">
            <p>服务启动完成后，进入平台登录页开始创建租户。</p>
            <Button type="primary" onClick={() => navigate('/login')}>
              前往登录 <ArrowRightOutlined />
            </Button>
          </footer>
        </div>
      </main>
    </ConfigProvider>
  );
}
