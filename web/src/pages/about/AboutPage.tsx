// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { Button, Card, Col, Descriptions, Row, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMenu } from '../../menu/MenuContext';
import { zh } from '../../locale/zh';
import './about.css';

const capabilities = [
  {
    titleKey: 'dataPermissions',
    descriptionKey: 'dataPermissionsDescription',
    menus: ['purchaseOrders', 'authority', 'orgDepartments'],
  },
  {
    titleKey: 'approvalWorkflows',
    descriptionKey: 'approvalWorkflowsDescription',
    menus: ['flowTodo', 'enterpriseCollab', 'customFormManagement'],
  },
  {
    titleKey: 'dataManagement',
    descriptionKey: 'dataManagementDescription',
    menus: [],
  },
];
export default function AboutPage() {
  const menu = useMenu();
  const navigate = useNavigate();
  return (
    <div className="about-page">
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={9}>
          <Card className="about-card">
            <div className="about-project-logo">
              <img src="/logo.png" alt="go-echo-admin" width={136} height={136} />
            </div>
            <div className="about-project-description">
              <Typography.Title level={2}>go-echo-admin</Typography.Title>
              <Typography.Paragraph type="secondary">
                Go + Echo + React 管理控制台
              </Typography.Paragraph>
              <Typography.Paragraph>
                {zh['aboutWorkspaceDescription']}
              </Typography.Paragraph>
            </div>
            <Space className="about-stack-tags" wrap>
              <Tag color="blue">React</Tag>
              <Tag color="blue">TypeScript</Tag>
              <Tag color="blue">Ant Design</Tag>
              <Tag color="cyan">Echo</Tag>
              <Tag color="cyan">GORM</Tag>
              <Tag color="cyan">Casbin</Tag>
            </Space>
          </Card>
          <Card title={zh['projectDetails']} className="about-card" style={{ marginTop: 24 }}>
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: 'web',
                  label: zh['managementConsole'],
                  children: 'frontend/ · React + TypeScript',
                },
                { key: 'api', label: zh['service'], children: 'backend/ · Go + Echo' },
                {
                  key: 'business',
                  label: zh['businessModules'],
                  children: 'backend/internal/modules/business/purchase/',
                },
                { key: 'docs', label: zh['documentation'], children: 'README.md · docs/FOUNDATION.md' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card title={zh['capabilities']} className="about-card">
            <div className="about-capabilities">
              {capabilities.map((item) => {
                const path = item.menus.map(menu.pathOf).find(Boolean);
                return (
                  <article key={item.titleKey}>
                    <h3>{zh[item.titleKey]}</h3>
                    <p>{zh[item.descriptionKey]}</p>
                    {path && (
                      <Button
                        type="link"
                        icon={<ArrowRightOutlined />}
                        onClick={() => navigate(path)}
                      >
                        {zh['open']}
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </Card>
          <Card title={zh['aboutWorkspace']} className="about-card" style={{ marginTop: 24 }}>
            <Typography.Paragraph>
              {zh['aboutWorkspaceDescription']}
            </Typography.Paragraph>
            <Typography.Paragraph>
              {zh['aboutWorkspaceDetails']}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {zh['aboutWorkspaceAudit']}
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
