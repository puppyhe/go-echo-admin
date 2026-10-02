// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Template package list and package creation form.
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { autoCodeApi } from '../../api/endpoints';
import type { SysPackage } from '../../domain/autoCode';

// Internal implementation detail.
interface PkgFormValues {
  packageName: string;
  packageDesc?: string;
}

// Internal implementation detail.
const packageNameValidator = (_rule: unknown, value: string) =>
  new Promise<void>((resolve, reject) => {
    const text = (value ?? '').trim();
    if (!text) {
      reject(new Error('请输入包名'));
      return;
    }
    // Reject Han characters while allowing ordinary Go package identifiers.
    if (/[\u3400-\u9fff]/u.test(text)) {
      reject(new Error('包名不能包含中文字符'));
      return;
    }
    if (/^\d/.test(text)) {
      reject(new Error('包名不能以数字开头'));
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(text)) {
      reject(new Error('包名只能包含英文字母、数字和下划线'));
      return;
    }
    resolve();
  });

export default function AutoPkgPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PkgFormValues>();

  const [rows, setRows] = useState<SysPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    void autoCodeApi
      .getPackage()
      .then((list) => setRows(list))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Internal implementation detail.
  const onCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await autoCodeApi.createPackage({
        packageName: values.packageName.trim(),
        packageDesc: (values.packageDesc ?? '').trim(),
      });
      message.success('添加成功');
      setCreateOpen(false);
      form.resetFields();
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setSubmitting(false);
    }
  };

  // Internal implementation detail.
  const onDelete = async (row: SysPackage) => {
    try {
      await autoCodeApi.delPackage({ ID: row.ID });
      message.success('删除成功');
      loadList();
    } catch {
      // Internal implementation detail.
    }
  };

  const columns: TableColumnsType<SysPackage> = [
    { title: 'ID', dataIndex: 'ID', width: 80 },
    { title: '包名', dataIndex: 'packageName', width: 220 },
    {
      title: '包描述',
      dataIndex: 'packageDesc',
      render: (value: unknown) =>
        value === null || value === undefined || value === '' ? '-' : String(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_v, row) => (
        <Popconfirm
          title="确定要删除这个软件包吗？"
          onConfirm={() => void onDelete(row)}
        >
          <Button type="link" size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Card className="table-card" styles={{ body: { padding: '16px 16px 0' } }}>
        <div
          className="table-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0 14px',
          }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建包
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadList} />
        </div>
        <Table<SysPackage>
          rowKey={(row) => row.ID}
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      {/* create Package */}
      <Modal
        title="创建软件包"
        open={createOpen}
        onOk={() => void onCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        destroyOnHidden
        width={480}
      >
        <Form<PkgFormValues> form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="packageName"
            label="包名"
            validateFirst
            rules={[{ required: true, message: '请输入包名' }, { validator: packageNameValidator }]}
          >
            <Input
              placeholder="请输入英文字母、数字和下划线，不能以数字开头"
              maxLength={64}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item name="packageDesc" label="包描述">
            <Input.TextArea placeholder="请输入包描述（选填）" rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
