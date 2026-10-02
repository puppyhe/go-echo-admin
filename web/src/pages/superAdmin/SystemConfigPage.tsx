import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// System configuration editing and explicit server reload feedback.
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { App, Alert, Button, Card, Input, Modal, Popconfirm, Space, Spin, Typography } from 'antd';
import { ReloadOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons';
import { systemApi } from '../../api/endpoints';

// Internal implementation detail.
const EDITOR_STYLE: CSSProperties = {
  fontFamily: 'Menlo, Consolas, "Courier New", monospace',
  fontSize: 13,
  lineHeight: '20px',
  minHeight: 480,
};

export default function SystemConfigPage() {
  const { message } = App.useApp();
  const canManage = useSuperAdmin();
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const res = await systemApi.getSystemConfig();
      setConfig(res?.config ?? '');
    } catch {
      // Internal implementation detail.
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  /** 保存配置 */
  const onSave = async () => {
    setSaving(true);
    try {
      await systemApi.setSystemConfig({ config });
      message.success('配置已保存，服务即将重启');
      await loadConfig();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  // Internal implementation detail.
  const onReload = async () => {
    setReloading(true);
    try {
      await systemApi.reloadSystem();
      Modal.info({ title: '配置已重新加载', content: '服务配置已重新加载' });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setReloading(false);
    }
  };

  if (!canManage) return <Alert type="info" showIcon message="系统配置管理需要超级管理员权限" />;
  return (
    <Card
      title="配置文件（.env）"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadConfig()} loading={loading}>
            刷新
          </Button>
          <Popconfirm
            title="保存将更新 .env，服务将重启"
            description="将更新 dotenv 配置内容，错误配置可能导致服务启动失败。"
            okText="保存"
            cancelText="取消"
            onConfirm={() => void onSave()}
          >
            <Button type="primary" icon={<SaveOutlined />} loading={saving}>
              保存
            </Button>
          </Popconfirm>
          <Popconfirm title="确认重新加载配置？" onConfirm={() => void onReload()}>
            <Button icon={<SyncOutlined />} loading={reloading}>
              重新加载配置
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="在此查看服务配置。格式为 ECHO_ADMIN_SECTION_FIELD=value；生产环境请通过秘密管理系统注入，敏感值不会在日志中显示。"
      />
      {loading && config === '' ? (
        <div style={{ minHeight: 480, display: 'grid', placeItems: 'center' }}>
          <Spin />
        </div>
      ) : (
        <Input.TextArea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          style={EDITOR_STYLE}
          spellCheck={false}
          placeholder="服务返回的配置内容"
        />
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        当前 {config.length} 字符 · 可直接编辑，行高 20px
      </Typography.Text>
    </Card>
  );
}
