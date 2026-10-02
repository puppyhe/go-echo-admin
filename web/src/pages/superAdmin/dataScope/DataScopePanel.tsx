import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Select, Space, Spin, Tag, TreeSelect, Typography } from 'antd';
import { scopeApi } from './api';
import { scopeLabels, scopePayload, scopeTree, type ScopeDocument, type ScopeMode } from './model';
export function DataScopePanel({
  authorityId,
  onSaved,
}: {
  authorityId: number;
  onSaved?: () => void;
}) {
  const { message } = App.useApp();
  const [doc, setDoc] = useState<ScopeDocument>();
  const [mode, setMode] = useState<ScopeMode>('self');
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const adopt = (value: ScopeDocument) => {
    setDoc(value);
    setMode(value.mode);
    setIds(value.departmentIds);
  };
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      adopt(await scopeApi.get(authorityId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载数据范围失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    setDoc(undefined);
    setLoading(true);
    setError('');
    void scopeApi
      .get(authorityId)
      .then((v) => {
        if (active) adopt(v);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '加载数据范围失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authorityId]);
  const departmentMap = new Map<number, { name: string; disabled: boolean }>();
  const visitDepartments = (nodes: ScopeDocument['departments']) =>
    nodes.forEach((node) => {
      departmentMap.set(node.id, node);
      visitDepartments(node.children ?? []);
    });
  visitDepartments(doc?.departments ?? []);
  const inactiveIds = ids.filter((id) => !departmentMap.has(id) || departmentMap.get(id)?.disabled);
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    setError('');
    try {
      const next = await scopeApi.save(scopePayload(doc, mode, ids));
      adopt(next);
      message.success('数据已保存并校验');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存数据范围失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Spin spinning={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          showIcon
          type="info"
          message="数据范围说明"
          description="数据范围会限制角色可查看、编辑和导出的数据。请选择范围后保存，部门范围仅对当前租户生效。"
        />
        {error && (
          <Alert
            showIcon
            type="error"
            message={error}
            action={
              <Button size="small" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        )}
        {doc && (
          <>
            <Space wrap>
              <Tag color={doc.configured ? 'blue' : 'orange'}>
                {doc.configured ? `已配置 · 版本 ${doc.version}` : '未配置 · 使用默认范围'}
              </Tag>
              {!doc.canWrite && (
                <Typography.Text type="secondary">
                  当前角色仅可查看，无法编辑数据范围。
                </Typography.Text>
              )}
            </Space>
            {!doc.configured && (
              <Alert
                type="warning"
                message="当前角色尚未配置数据范围"
                description="保存后将为该角色设置数据范围；未配置时默认允许查看全部数据。"
              />
            )}
            <Form layout="vertical">
              <Form.Item
                label={doc.configured ? '数据范围' : '数据范围（默认：全部数据）'}
                required
              >
                <Select
                  disabled={!doc.canWrite || saving}
                  value={mode}
                  options={Object.entries(scopeLabels).map(([value, label]) => ({ value, label }))}
                  onChange={(value) => setMode(value as ScopeMode)}
                />
              </Form.Item>
              {mode === 'custom' && (
                <Form.Item
                  label="部门"
                  required
                  extra="请选择部门。已禁用或已删除的部门不能新选，但已有配置会保留，保存前可以移除。"
                >
                  {doc.canWrite ? (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <TreeSelect
                        style={{ width: '100%' }}
                        treeData={scopeTree(doc.departments)}
                        treeCheckable
                        treeCheckStrictly
                        value={ids
                          .filter((id) => !inactiveIds.includes(id))
                          .map((value) => ({ value, label: departmentMap.get(value)?.name }))}
                        onChange={(values) =>
                          setIds([...inactiveIds, ...values.map((v) => Number(v.value))])
                        }
                        showCheckedStrategy={TreeSelect.SHOW_ALL}
                        treeNodeFilterProp="title"
                        placeholder="搜索部门"
                      />
                      {inactiveIds.length > 0 && (
                        <>
                          <Typography.Text type="warning">
                            以下部门已被禁用或已删除；保存时可以移除。
                          </Typography.Text>
                          <Space wrap>
                            {inactiveIds.map((id) => (
                              <Tag
                                key={id}
                                color="orange"
                                closable
                                onClose={() =>
                                  setIds((values) => values.filter((value) => value !== id))
                                }
                              >
                                {departmentMap.get(id)?.name ?? `部门 #${id}`}（已失效）
                              </Tag>
                            ))}
                          </Space>
                        </>
                      )}
                    </Space>
                  ) : (
                    <Space wrap>
                      {ids.map((id) => (
                        <Tag key={id}>部门 #{id}</Tag>
                      ))}
                    </Space>
                  )}
                </Form.Item>
              )}
              <Typography.Paragraph type="secondary">
                {!doc.configured && '保存提示：'}
                {mode === 'all'
                  ? '全部数据；可查看、编辑和导出所有数据。'
                  : mode === 'department'
                    ? '仅本部门数据；仅可查看和操作当前用户所属部门的数据。'
                    : mode === 'departmentTree'
                      ? '本部门及下属部门数据；包含当前部门的所有下属部门。'
                      : mode === 'self'
                        ? '仅本人数据；仅可查看和操作本人创建或关联的数据。'
                        : '自定义部门数据；仅限所选部门的数据。'}
              </Typography.Paragraph>
              <Space>
                <Button disabled={saving} onClick={() => void load()}>
                  刷新
                </Button>
                {doc.canWrite && (
                  <Button type="primary" loading={saving} onClick={() => void save()}>
                    保存数据范围
                  </Button>
                )}
              </Space>
            </Form>
          </>
        )}
      </Space>
    </Spin>
  );
}
