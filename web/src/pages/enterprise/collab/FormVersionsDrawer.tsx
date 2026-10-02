import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { FormFields } from '../../systemTools/formRuntime';
import { initialValues } from '../../systemTools/formDesign';
import { collabApi } from './api';
import { formatTime, LoadError } from './shared';
import type { BusinessForm, FormVersion } from './types';

export default function FormVersionsDrawer({
  form,
  onClose,
  onRestored,
}: {
  form: BusinessForm;
  onClose: () => void;
  onRestored: (form: BusinessForm) => void;
}) {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<FormVersion[]>([]);
  const [current, setCurrent] = useState(form);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<FormVersion>();
  const seq = useRef(0);
  const load = useCallback(async () => {
    const request = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const [versions, latest] = await Promise.all([
        collabApi.formVersions(form.id),
        collabApi.form(form.id),
      ]);
      if (request === seq.current) {
        setRows(versions.list);
        setCurrent(latest);
      }
    } catch (e) {
      if (request === seq.current) setError(e instanceof Error ? e.message : '表单版本加载失败');
    } finally {
      if (request === seq.current) setLoading(false);
    }
  }, [form.id]);
  useEffect(() => {
    void load();
    return () => {
      seq.current++;
    };
  }, [load]);
  return (
    <>
      <Drawer
        open
        width="min(1080px,96vw)"
        title={`表单版本 · ${form.name}`}
        onClose={onClose}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
        getContainer={() => document.body}
      >
        <Alert
          showIcon
          type="info"
          message="发布版本保存详情、更新详情、发布详情、角色详情。"
          style={{ marginBottom: 16 }}
        />
        <LoadError error={error} retry={load} />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900 }}
          columns={[
            { title: '版本', dataIndex: 'version', width: 80, render: (v) => `v${v}` },
            {
              title: '状态',
              width: 110,
              render: (_, r) => (
                <Tag color={r.current ? 'green' : 'default'}>{r.current ? '已发布' : '版本'}</Tag>
              ),
            },
            {
              title: '校验信息',
              dataIndex: 'checksum',
              width: 190,
              render: (v) => (
                <Typography.Text copyable={{ text: v }}>{v.slice(0, 16)}</Typography.Text>
              ),
            },
            { title: '时间', dataIndex: 'createdAt', render: formatTime, width: 185 },
            { title: '实例数', dataIndex: 'instanceCount', width: 90 },
            { title: '描述', dataIndex: 'note', ellipsis: true },
            {
              title: '操作',
              fixed: 'right',
              render: (_, r) => (
                <Space size={0}>
                  <Button
                    type="link"
                    onClick={async () =>
                      setSnapshot(await collabApi.formVersion(form.id, r.version))
                    }
                  >
                    查看
                  </Button>
                  <Button
                    type="link"
                    onClick={() =>
                      modal.confirm({
                        title: `确认恢复版本 v${r.version}？`,
                        content: '确认要恢复到此版本吗？此操作将覆盖当前配置。',
                        okText: '确认',
                        cancelText: '取消',
                        onOk: async () => {
                          try {
                            const restored = await collabApi.restoreForm(
                              form.id,
                              r.version,
                              current.revision,
                            );
                            message.success('保存成功');
                            onRestored(restored);
                          } catch (e) {
                            await load();
                            throw e;
                          }
                        },
                      })
                    }
                  >
                    恢复
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Drawer>
      <Modal
        open={!!snapshot}
        title={`表单版本详情 v${snapshot?.version ?? ''}`}
        onCancel={() => setSnapshot(undefined)}
        footer={<Button onClick={() => setSnapshot(undefined)}>关闭</Button>}
        width={800}
      >
        {snapshot && (
          <>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'name', label: '名称', children: snapshot.definition.name },
                { key: 'code', label: '编码', children: snapshot.definition.code },
                {
                  key: 'hash',
                  label: '校验信息',
                  children: <Typography.Text copyable>{snapshot.checksum}</Typography.Text>,
                },
              ]}
            />
            <Typography.Paragraph type="secondary">
              {snapshot.definition.description}
            </Typography.Paragraph>
            <Form
              key={snapshot.id}
              layout={snapshot.definition.schema.layout}
              initialValues={initialValues(snapshot.definition.schema)}
              disabled
            >
              <FormFields fields={snapshot.definition.schema.fields} disabled />
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
