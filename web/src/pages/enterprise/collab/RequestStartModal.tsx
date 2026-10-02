import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Typography,
} from 'antd';
import { FormFields } from '../../systemTools/formRuntime';
import { initialValues } from '../../systemTools/formDesign';
import { allPages, collabApi } from './api';
import { serializeSubmission } from './model';
import { LoadError } from './shared';
import type { BusinessForm, Workflow, RequestUrgency } from './types';
import { urgencyOptions } from './RequestFilters';
import { GraphSnapshotView } from './graph/GraphSnapshotView';

export function RequestStartModal({
  onClose,
  onSubmitted,
  initialWorkflowId,
}: {
  onClose: () => void;
  onSubmitted: (id: number) => void;
  initialWorkflowId?: number;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    urgency?: RequestUrgency;
    businessKey?: string;
    formId: number;
    workflowId: number;
    title: string;
    data: Record<string, unknown>;
  }>();
  const [forms, setForms] = useState<BusinessForm[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formId = Form.useWatch('formId', form);
  const workflowId = Form.useWatch('workflowId', form);
  const selectedForm = forms.find((item) => item.id === formId);
  const selectedWorkflow = workflows.find(
    (item) => item.id === workflowId && item.formId === formId,
  );
  const load = async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      allPages((query) => collabApi.forms({ ...query, status: 'published' })),
      allPages((query) => collabApi.workflows({ ...query, status: 'published' })),
    ]);
    const [formResult, workflowResult] = results;
    if (formResult.status === 'fulfilled')
      setForms(formResult.value.filter((item) => item.status === 'published'));
    if (workflowResult.status === 'fulfilled')
      setWorkflows(
        workflowResult.value.filter((item) => item.status === 'published' && !item.businessType),
      );
    if (
      initialWorkflowId &&
      formResult.status === 'fulfilled' &&
      workflowResult.status === 'fulfilled'
    ) {
      const selectedWorkflow = workflowResult.value.find((item) => item.id === initialWorkflowId);
      const selected = formResult.value.find((item) => item.id === selectedWorkflow?.formId);
      if (selected && selectedWorkflow) {
        form.setFieldsValue({
          formId: selected.id,
          workflowId: selectedWorkflow.id,
          title: selectedWorkflow.name,
        });
        form.setFieldValue('data', initialValues(selected.schema));
      }
    }
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected')
      setError(failure.reason instanceof Error ? failure.reason.message : '表单或工作流加载失败');
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedForm || !selectedWorkflow) {
        message.warning('验证前请选择表单和工作流');
        return;
      }
      const data = serializeSubmission(selectedForm.schema, values.data ?? {});
      setBusy(true);
      const created = await collabApi.submit({
        formId: selectedForm.id,
        workflowId: selectedWorkflow.id,
        title: values.title,
        businessKey: values.businessKey,
        urgency: values.urgency ?? 'normal',
        data,
      });
      message.success('保存成功');
      onSubmitted(created.id);
    } catch (error) {
      if (error instanceof Error && error.name !== 'ApiError') message.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  const changeForm = (id: number) => {
    const selected = forms.find((item) => item.id === id);
    const available = workflows.filter((item) => item.formId === id);
    form.resetFields();
    form.setFieldsValue({
      formId: id,
      workflowId: available.length === 1 ? available[0].id : undefined,
      title: selected?.name ?? '',
    });
    form.setFieldValue('data', selected ? initialValues(selected.schema) : {});
  };
  return (
    <Modal
      open
      title="审批请求"
      onCancel={() => {
        if (!busy) onClose();
      }}
      width={850}
      footer={
        <Space>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={loading || !!error || !selectedWorkflow}
            onClick={() => void submit()}
          >
            提交
          </Button>
        </Space>
      }
    >
      <LoadError error={error} retry={load} />
      <Spin spinning={loading}>
        {!loading && !error && !forms.length && (
          <Empty description="暂无表单，请先创建表单并配置审批流程。" />
        )}
        <Form form={form} layout="vertical">
          <Form.Item
            name="formId"
            label="表单"
            rules={[{ required: true, message: '请选择表单' }]}
          >
            <Select
              showSearch
              optionFilterProp="label="
              placeholder="请选择表单"
              options={forms.map((item) => ({
                value: item.id,
                label: `${item.name} · v${item.version}`,
              }))}
              onChange={changeForm}
            />
          </Form.Item>
          <Form.Item
            name="workflowId"
            label="审批工作流"
            rules={[{ required: true, message: '请选择审批工作流' }]}
          >
            <Select
              showSearch
              optionFilterProp="label="
              placeholder="请选择审批工作流"
              options={workflows
                .filter((item) => item.formId === formId)
                .map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          {formId && !workflows.some((item) => item.formId === formId) && (
            <Alert
              type="warning"
              showIcon
              message="该表单暂无已发布的审批工作流。"
              style={{ marginBottom: 16 }}
            />
          )}
          {selectedWorkflow && (
            <div className="collab-flow-preview">
              {selectedWorkflow.graph ? (
                <GraphSnapshotView graph={selectedWorkflow.graph} />
              ) : (
                <Steps
                  direction="vertical"
                  size="small"
                  items={selectedWorkflow.steps.map((step) => ({
                    title: step.name,
                    description: `${step.mode === 'all' ? '全体审批人通过' : '审批人通过'}${step.condition ? ' · 满足条件' : ''}`,
                  }))}
                />
              )}
            </div>
          )}
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, whitespace: true, message: '请输入标题' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="urgency" label="优先级" initialValue="normal">
            <Select options={urgencyOptions} />
          </Form.Item>
          <Form.Item
            name="businessKey"
            label="业务标识"
            extra="例如：订单ID、客户名称等，用于关联具体业务对象。"
          >
            <Input maxLength={160} />
          </Form.Item>
          {selectedForm && (
            <>
              <Typography.Title level={5}>{selectedForm.schema.title}</Typography.Title>
              <Typography.Paragraph type="secondary">
                {selectedForm.description}
              </Typography.Paragraph>
              <FormFields
                key={selectedForm.id}
                fields={selectedForm.schema.fields}
                prefix={['data']}
                disabled={busy}
              />
            </>
          )}
        </Form>
      </Spin>
    </Modal>
  );
}
