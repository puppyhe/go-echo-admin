import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { session } from '../../../api/request';
import { allPages, collabApi } from '../../enterprise/collab/api';
import { RequestDetailDrawer } from '../../enterprise/collab/RequestDetailDrawer';
import type { Workflow } from '../../enterprise/collab/types';
import { purchaseApi, type Purchase, type PurchaseInput } from './api';
import { availablePurchaseWorkflows, purchaseCents } from './model';
type PurchaseFormValue = Omit<PurchaseInput, 'amountCents'> & { amountYuan: number };

const labels: Record<string, string> = {
  draft: 'message=',
  pending: 'approvalmessage',
  approved: 'passed',
  rejected: 'message=',
  withdrawn: 'message=',
};
const colors: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'warning',
};
const editable = (row: Purchase) => ['draft', 'rejected', 'withdrawn'].includes(row.status);

export default function PurchasesPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Purchase | 'new'>();
  const [submitting, setSubmitting] = useState<Purchase>();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowId, setWorkflowId] = useState<number>();
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailID, setDetailID] = useState<number>();
  const [form] = Form.useForm<PurchaseFormValue>();
  const sequence = useRef(0);
  const choiceSequence = useRef(0);
  const editSequence = useRef(0);
  useEffect(
    () => () => {
      choiceSequence.current++;
      editSequence.current++;
    },
    [],
  );
  const userID = session.getSnapshot()?.ID;

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await purchaseApi.list({ page, pageSize, keyword, status });
      if (current !== sequence.current) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setRows(result.list ?? []);
      setTotal(result.total);
    } catch (e) {
      if (current === sequence.current) {
        setRows([]);
        setTotal(0);
        setError(e instanceof Error ? e.message : 'purchase orderload failed');
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, pageSize, keyword, status]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);

  async function edit(row?: Purchase) {
    const current = ++editSequence.current;
    try {
      const fresh = row ? await purchaseApi.get(row.id) : undefined;
      if (current !== editSequence.current) return;
      if (fresh && !editable(fresh)) {
        message.warning('请先保存采购单，再刷新列表');
        await load();
        return;
      }
      form.resetFields();
      form.setFieldsValue(
        fresh
          ? { ...fresh, amountYuan: fresh.amountCents / 100 }
          : { title: '', note: '', amountYuan: 1, version: 0 },
      );
      setEditing(fresh ?? 'new');
    } catch {
      /* shared request layer displays the error */
    }
  }
  async function save() {
    const values = await form.validateFields();
    const amountCents = purchaseCents(values.amountYuan);
    setBusy(true);
    try {
      await purchaseApi.save(
        {
          title: values.title,
          note: values.note ?? '',
          amountCents,
          version: editing && editing !== 'new' ? editing.version : 0,
        },
        editing && editing !== 'new' ? editing.id : undefined,
      );
      message.success('采购单保存成功');
      setEditing(undefined);
      await load();
    } catch {
      /* keep the draft for conflict recovery */
    } finally {
      setBusy(false);
    }
  }
  async function start(row: Purchase) {
    const current = ++choiceSequence.current;
    setSubmitting(row);
    setWorkflowId(undefined);
    setWorkflows([]);
    setWorkflowError('');
    setWorkflowLoading(true);
    try {
      const [fresh, choices] = await Promise.all([
        purchaseApi.get(row.id),
        allPages((q) => collabApi.workflows({ ...q, status: 'published', enabled: true })),
      ]);
      if (current !== choiceSequence.current) return;
      setSubmitting(fresh);
      const available = availablePurchaseWorkflows(choices);
      setWorkflows(available);
      if (available.length === 1) setWorkflowId(available[0].id);
    } catch (e) {
      if (current === choiceSequence.current)
        setWorkflowError(e instanceof Error ? e.message : 'approvalworkflowload failed');
    } finally {
      if (current === choiceSequence.current) setWorkflowLoading(false);
    }
  }
  async function exportRows() {
    if (exporting) return;
    setExporting(true);
    try {
      await purchaseApi.export({ keyword, status });
    } catch {
      /* request helper reports errors */
    } finally {
      setExporting(false);
    }
  }
  async function submit() {
    if (!submitting || !workflowId) return;
    setBusy(true);
    try {
      const detail = await purchaseApi.submit(submitting, workflowId);
      message.success('审批成功');
      setSubmitting(undefined);
      setDetailID(detail.id);
      await load();
    } catch {
      /* retain the selection and reload the business version on reopening */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          purchase order
        </Typography.Title>
        <Typography.Text type="secondary">
          label、labelapproval，labelrolelabeldatalabelquerylabelexport。
        </Typography.Text>
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button onClick={() => void load()}>retry</Button>}
        />
      )}
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            aria-label="searchtitle"
            placeholder="searchtitle"
            allowClear
            onSearch={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            style={{ width: 240 }}
          />
          <Select
            aria-label="status"
            placeholder="allstatus"
            allowClear
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
            style={{ width: 150 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void edit()}>
            create newpurchase order
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportRows()}>
            export Excel
          </Button>
          <Button
            aria-label="refreshpurchase order"
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            loading={loading}
          />
        </Space>
        <Table<Purchase>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 950 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
            },
          }}
          columns={[
            { title: 'message=', dataIndex: 'id', width: 90, render: (id) => `PO-${id}` },
            { title: 'title', dataIndex: 'title' },
            {
              title: 'message（message）',
              dataIndex: 'amountCents',
              align: 'right',
              render: (n: number) => (n / 100).toFixed(2),
            },
            {
              title: 'status',
              dataIndex: 'status',
              render: (value: string) => <Tag color={colors[value]}>{labels[value] ?? value}</Tag>,
            },
            { title: 'message ID', dataIndex: 'ownerId', width: 110 },
            {
              title: 'createmessage',
              dataIndex: 'createdAt',
              render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }),
            },
            {
              title: 'message=',
              width: 260,
              render: (_, row) => (
                <Space wrap size={0}>
                  {editable(row) && (
                    <Button type="link" onClick={() => void edit(row)}>
                      edit
                    </Button>
                  )}
                  {editable(row) && row.ownerId === userID && (
                    <Button type="link" onClick={() => void start(row)}>
                      {row.approvalRequestId ? 'message=' : 'approval'}
                    </Button>
                  )}
                  {!!row.approvalRequestId && (
                    <Button type="link" onClick={() => setDetailID(row.approvalRequestId)}>
                      approvallabel
                    </Button>
                  )}
                  {row.status === 'draft' && !row.approvalRequestId && (
                    <Popconfirm
                      title="deletemessage？"
                      onConfirm={async () => {
                        await purchaseApi.delete(row);
                        await load();
                      }}
                    >
                      <Button type="link" danger>
                        delete
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing === 'new' ? 'create newpurchase order' : 'editpurchase order'}
        forceRender
        open={!!editing}
        confirmLoading={busy}
        onOk={() => void save().catch(() => {})}
        onCancel={() => {
          if (!busy) {
            editSequence.current++;
            setEditing(undefined);
          }
        }}
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item
            name="title="
            label="title="
            rules={[{ required: true, whitespace: true, max: 200 }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="message（message）"
            rules={[{ required: true, type: 'number', min: 0.01, max: 10000000000 }]}
          >
            <InputNumber
              precision={2}
              min={0.01}
              max={10000000000}
              step={0.01}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="note" label="description=" rules={[{ max: 4000 }]}>
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={submitting?.approvalRequestId ? 'approval' : 'approval'}
        open={!!submitting}
        confirmLoading={busy}
        okButtonProps={{
          disabled:
            !workflowId ||
            workflowLoading ||
            !!workflowError ||
            !submitting ||
            !editable(submitting),
        }}
        onOk={() => void submit()}
        onCancel={() => {
          if (!busy) {
            choiceSequence.current++;
            setSubmitting(undefined);
          }
        }}
      >
        {workflowError && <Alert type="error" message={workflowError} />}
        <Typography.Paragraph>
          {submitting?.title} · {((submitting?.amountCents ?? 0) / 100).toFixed(2)} label
        </Typography.Paragraph>
        {!workflowLoading && !workflowError && workflows.length === 0 && (
          <Alert
            type="info"
            showIcon
            message="approvalworkflow"
            description="workflowcreateDetails“purchase order”workflow, releaseroleDetails."
            style={{ marginBottom: 16 }}
          />
        )}
        <Select
          aria-label="selectapprovalworkflow"
          placeholder="selectreleaseworkflow"
          loading={workflowLoading}
          value={workflowId}
          onChange={setWorkflowId}
          style={{ width: '100%' }}
          options={workflows.map((w) => ({ value: w.id, label: w.name }))}
        />
      </Modal>
      {detailID && (
        <RequestDetailDrawer
          id={detailID}
          onClose={() => setDetailID(undefined)}
          onChanged={() => void load()}
        />
      )}
    </Space>
  );
}
