// Local plugin workspace analysis, manifest editing, installation and packaging.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { DownloadOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { autoCodeApi, type PluginRow } from '../../api/endpoints';
import { pluginConfigApi } from './pluginConfig/api';
import { ConfigDrawer, countsText } from './pluginConfig/ConfigDrawer';
import { flattenTree, type Analysis } from './pluginConfig/model';
const labels: Record<string, string> = { server: '后端', web: '前端', full: '全栈' };
export default function PluginPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<PluginRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState('');
  const [analysis, setAnalysis] = useState<Analysis>();
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await autoCodeApi.getPluginList());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const analyze = async (upload: File) => {
    if (!/\.zip$/i.test(upload.name) || upload.size > 50 * 1024 * 1024) {
      message.warning('请选择50MB以内的ZIP文件');
      return;
    }
    setBusy('analyze');
    setError('');
    try {
      const result = await pluginConfigApi.analyze(upload);
      setAnalysis(result);
      setFile(upload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy('');
    }
  };
  const install = async () => {
    if (!file || !analysis) return;
    setBusy('install');
    try {
      await autoCodeApi.installPlugin(file);
      message.success('文件安装成功，可编辑配置');
      setAnalysis(undefined);
      setFile(undefined);
      await load();
    } catch {
    } finally {
      setBusy('');
    }
  };
  const packageZip = async (name: string) => {
    setBusy(name);
    try {
      await autoCodeApi.pubPlug({ pluginName: name });
      message.success('导出成功，Go 全栈模块');
    } catch {
    } finally {
      setBusy('');
    }
  };
  const remove = async (name: string) => {
    setBusy(name);
    try {
      await autoCodeApi.removePlugin({ pluginName: name });
      message.success('插件已删除，系统配置保留');
      await load();
    } catch {
    } finally {
      setBusy('');
    }
  };
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="插件管理说明 · 安装、配置与管理本地插件"
        description="文件详情。上传ZIP包启用详情；React 页面详情；Echo 路由；项目详情。"
      />
      {error && (
        <Alert type="error" showIcon message={error} closable onClose={() => setError('')} />
      )}
      <Card
        className="table-card"
        title="插件列表"
        extra={
          <Space>
            <Upload
              accept=".zip"
              showUploadList={false}
              beforeUpload={(upload) => {
                void analyze(upload);
                return false;
              }}
              disabled={!!busy}
            >
              <Button type="primary" icon={<UploadOutlined />} loading={busy === 'analyze'}>
                上传插件
              </Button>
            </Upload>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
          </Space>
        }
      >
        <Table<PluginRow>
          rowKey="pluginName"
          dataSource={rows}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
          scroll={{ x: 680 }}
          columns={[
            { title: '名称', dataIndex: 'pluginName' },
            {
              title: '类型',
              dataIndex: 'pluginType',
              render: (value) => (
                <Tag color={value === 'full' ? 'geekblue' : 'blue'}>{labels[value] ?? value}</Tag>
              ),
            },
            {
              title: '操作',
              width: 370,
              render: (_, row) => (
                <Space wrap>
                  <Button type="link" onClick={() => setEditing(row.pluginName)}>
                    配置
                  </Button>
                  <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    loading={busy === row.pluginName}
                    onClick={() => void packageZip(row.pluginName)}
                  >
                    下载
                  </Button>
                  <Popconfirm
                    title={`确定删除插件「${row.pluginName}」？`}
                    description="将删除后端文件，保留系统菜单、API、字典角色配置。详情见插件说明。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void remove(row.pluginName)}
                  >
                    <Button type="link" danger disabled={!!busy}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      {editing && <ConfigDrawer key={editing} name={editing} onClose={() => setEditing('')} />}
      <Modal
        title="安装插件"
        open={!!analysis}
        width={900}
        onCancel={() => {
          if (!busy) {
            setAnalysis(undefined);
            setFile(undefined);
          }
        }}
        onOk={() => void install()}
        okText="安装"
        confirmLoading={busy === 'install'}
        okButtonProps={{ disabled: !!analysis?.conflicts.length }}
      >
        {analysis && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions
              column={2}
              items={[
                { key: 'name', label: '名称', children: analysis.pluginName },
                { key: 'type', label: '类型', children: labels[analysis.pluginType] },
                {
                  key: 'count',
                  label: '数量',
                  span: 2,
                  children: countsText(analysis.counts),
                },
              ]}
            />
            {analysis.conflicts.map((v) => (
              <Alert key={v} type="error" message={v} />
            ))}
            {analysis.warnings.map((v) => (
              <Alert key={v} type="warning" message={v} />
            ))}
            <Alert
              type="success"
              message="ZIP 包路径、重复项详情、文件类型、验证已通过"
              description="请查看详情并确认无误后继续。"
            />
            <Typography.Paragraph>{analysis.manifest.description}</Typography.Paragraph>
            <Tabs
              items={[
                {
                  key: 'files',
                  label: '文件',
                  children: (
                    <Table
                      size="small"
                      rowKey={(v) => `${v.side}/${v.path}`}
                      dataSource={analysis.files}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        { title: '端', dataIndex: 'side', render: (v) => v || '未知' },
                        { title: '路径', dataIndex: 'path' },
                        { title: '大小', dataIndex: 'size' },
                      ]}
                    />
                  ),
                },
                {
                  key: 'menus',
                  label: '菜单',
                  children: (
                    <Table
                      size="small"
                      rowKey="key"
                      dataSource={flattenTree(analysis.manifest.menus)}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        { title: '标题', render: (_, v) => v.node.title },
                        { title: '名称', render: (_, v) => v.node.name },
                        { title: '路径', render: (_, v) => v.node.path },
                        { title: '组件', render: (_, v) => v.node.component },
                      ]}
                    />
                  ),
                },
                {
                  key: 'apis',
                  label: 'API',
                  children: (
                    <Table
                      size="small"
                      rowKey={(v) => `${v.method} ${v.path}`}
                      dataSource={analysis.manifest.apis}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        { title: '方法', dataIndex: 'method' },
                        { title: '路径', dataIndex: 'path' },
                        { title: '分组', dataIndex: 'apiGroup' },
                        { title: '描述', dataIndex: 'description' },
                      ]}
                    />
                  ),
                },
                {
                  key: 'dictionaries',
                  label: '字典',
                  children: (
                    <Table
                      size="small"
                      rowKey="type"
                      dataSource={analysis.manifest.dictionaries}
                      pagination={{ pageSize: 8 }}
                      expandable={{
                        expandedRowRender: (d) => (
                          <Table
                            size="small"
                            rowKey="key"
                            dataSource={flattenTree(d.details)}
                            pagination={false}
                            columns={[
                              { title: '标签', render: (_, v) => v.node.label },
                              { title: '值', render: (_, v) => v.node.value },
                              {
                                title: '状态',
                                render: (_, v) => (v.node.status ? '启用' : '禁用'),
                              },
                            ]}
                          />
                        ),
                      }}
                      columns={[
                        { title: '名称', dataIndex: 'name' },
                        { title: '类型', dataIndex: 'type' },
                        {
                          title: '状态',
                          dataIndex: 'status',
                          render: (value) => (value ? '启用' : '禁用'),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Space>
        )}
      </Modal>
    </Space>
  );
}
