import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FormDesigner } from '../../systemTools/FormCreatePage';
import {
  blankDesign,
  initialValues,
  parseDesign,
  validateDesign,
  type FormDesign,
} from '../../systemTools/formDesign';
import { FormFields } from '../../systemTools/formRuntime';
import { collabApi } from './api';
import FormVersionsDrawer from './FormVersionsDrawer';
import {
  canManage,
  formatTime,
  ListToolbar,
  LoadError,
  SharedRoles,
  StatusTag,
  usePagedList,
} from './shared';
import type { BusinessForm, FormInput } from './types';

export function FormsPanel() {
  const list = usePagedList(collabApi.forms);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<BusinessForm | null>();
  const [schema, setSchema] = useState<FormDesign>(blankDesign);
  const [form] = Form.useForm<Omit<FormInput, 'schema'>>();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<BusinessForm>();
  const [preview, setPreview] = useState<BusinessForm>();
  const edit = async (record?: BusinessForm) => {
    try {
      const current = record ? await collabApi.form(record.id) : undefined;
      setSchema(current ? parseDesign(JSON.stringify(current.schema), false) : blankDesign());
      form.resetFields();
      form.setFieldsValue({
        name: current?.name ?? '',
        code: current?.code ?? '',
        description: current?.description ?? '',
        sharedRoleIds: current?.sharedRoleIds ?? [],
      });
      setEditing(current ?? null);
    } catch {
      /* Request errors are surfaced by the request helper. */
    }
  };
  const save = async (publish: boolean) => {
    try {
      const values = await form.validateFields();
      const error = publish ? validateDesign(schema) : null;
      if (error) {
        message.warning(error);
        return;
      }
      setBusy(true);
      const saved = await collabApi.saveForm(
        { ...values, schema, revision: editing?.revision },
        editing?.id,
      );
      // Keep the saved ID if publish fails, so retry never creates a duplicate form.
      setEditing(saved);
      if (publish) await collabApi.publishForm(saved.id, saved.revision);
      message.success(publish ? '工作流发布成功' : '保存成功');
      setEditing(undefined);
      void list.reload();
    } catch {
      /* Validation and API feedback are already visible. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ListToolbar search={list.search} reload={list.reload}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void edit()}>
          创建新表单
        </Button>
      </ListToolbar>
      <LoadError error={list.error} retry={list.reload} />
      <Table
        rowKey="id"
        dataSource={list.result.list}
        loading={list.loading}
        pagination={list.pagination}
        scroll={{ x: 850 }}
        columns={[
          {
            title: '表单名称',
            dataIndex: 'name',
            render: (name: string, row) => (
              <Button type="link" onClick={() => setPreview(row)}>
                {name}
              </Button>
            ),
          },
          { title: '编码', dataIndex: 'code', width: 180, ellipsis: true },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (status) => <StatusTag status={status} />,
          },
          {
            title: '版本号',
            dataIndex: 'version',
            width: 110,
            render: (version) => (version ? `v${version}` : '未发布'),
          },
          { title: '更新时间', dataIndex: 'updatedAt', width: 190, render: formatTime },
          {
            title: '操作',
            width: 285,
            render: (_, row) =>
              canManage(row.ownerId) ? (
                <Space size={0}>
                  <Button type="link" onClick={() => void edit(row)}>
                    编辑
                  </Button>
                  {row.status === 'draft' && (
                    <Popconfirm
                      title="确认发布表单？"
                      onConfirm={async () => {
                        await collabApi.publishForm(row.id, row.revision);
                        message.success('发布成功');
                        await list.reload();
                      }}
                    >
                      <Button type="link">发布</Button>
                    </Popconfirm>
                  )}
                  <Button type="link" onClick={() => setHistory(row)}>
                    版本
                  </Button>
                  <Popconfirm
                    title="确认删除表单？"
                    description="确认要删除此表单吗？"
                    onConfirm={async () => {
                      await collabApi.deleteForm(row.id);
                      message.success('删除成功');
                      await list.reload();
                    }}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Typography.Text type="secondary">详情</Typography.Text>
              ),
          },
        ]}
      />
      <Drawer
        title={editing ? `编辑表单 · ${editing.name}` : '创建新表单'}
        open={editing !== undefined}
        width="min(1360px, 96vw)"
        destroyOnHidden
        onClose={() => {
          if (!busy) setEditing(undefined);
        }}
        extra={
          <Space>
            <Button disabled={busy} onClick={() => setEditing(undefined)}>
              取消
            </Button>
            <Button loading={busy} onClick={() => void save(false)}>
              保存
            </Button>
            <Button type="primary" loading={busy} onClick={() => void save(true)}>
              保存并发布
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        <Alert
          type="info"
          showIcon
          message="编辑表单后将保留历史记录，请谨慎操作。"
          style={{ marginBottom: 20 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="表单名称"
            rules={[{ required: true, whitespace: true, message: '请输入表单名称' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="code"
            label="表单编码"
            extra="编码规则；发布后将不可修改。"
            rules={[
              {
                pattern: /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/,
                message: '编码只能包含字母、数字、下划线和连字符',
              },
            ]}
          >
            <Input maxLength={100} disabled={!!editing?.version} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea maxLength={1000} rows={2} />
          </Form.Item>
          <Form.Item
            name="sharedRoleIds"
            label="角色"
            extra="发布表单给指定角色；可编辑并管理表单权限。"
          >
            <SharedRoles />
          </Form.Item>
        </Form>
        <FormDesigner value={schema} onChange={setSchema} />
      </Drawer>
      {history && (
        <FormVersionsDrawer
          form={history}
          onClose={() => setHistory(undefined)}
          onRestored={(restored) => {
            setHistory(undefined);
            void list.reload();
            void edit(restored);
          }}
        />
      )}
      <Modal
        title={preview?.name}
        open={!!preview}
        onCancel={() => setPreview(undefined)}
        footer={<Button onClick={() => setPreview(undefined)}>关闭</Button>}
        width={760}
      >
        <Typography.Paragraph type="secondary">{preview?.description}</Typography.Paragraph>
        {preview && (
          <Form
            key={`${preview.id}-${preview.revision}`}
            layout={preview.schema.layout}
            initialValues={initialValues(preview.schema)}
            disabled
          >
            <FormFields fields={preview.schema.fields} disabled />
          </Form>
        )}
      </Modal>
    </>
  );
}
