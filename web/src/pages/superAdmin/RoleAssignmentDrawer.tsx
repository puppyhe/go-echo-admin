import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Drawer, Input, Space, Spin, Tree } from 'antd';
import { authorityService } from '../../services/authorityService';
import type { DataNode } from 'antd/es/tree';
import type { SysAuthority } from '../../domain/authority';

interface Props {
  title: string;
  open: boolean;
  loadSelected: () => Promise<number[]>;
  saveSelected: (ids: number[]) => Promise<unknown>;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RoleAssignmentDrawer({
  title,
  open,
  loadSelected,
  saveSelected,
  onClose,
  onSuccess,
}: Props) {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();
  const [roles, setRoles] = useState<SysAuthority[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setReady(false);
    setFilter('');
    setSelected([]);
    void Promise.all([authorityService.listAll(), loadSelected()])
      .then(([items, ids]) => {
        if (!active) return;
        setRoles(items);
        setSelected(ids);
        setReady(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, loadSelected]);

  const treeData = useMemo(() => {
    const byId = new Map(
      roles.map((role) => [
        role.authorityId,
        {
          key: role.authorityId,
          title: `${role.authorityName}（${role.authorityId}）`,
          children: [] as DataNode[],
        },
      ]),
    );
    const roots: DataNode[] = [];
    roles.forEach((role) => {
      const node = byId.get(role.authorityId)!;
      const parent = byId.get(role.parentId ?? 0);
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    });
    return roots;
  }, [roles]);

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await saveSelected(selected);
      message.success('角色更新成功');
      onSuccess?.();
      onClose();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={title}
      getContainer={() => document.body}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!canWrite || !ready}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Alert type="info" showIcon message="勾选角色，保存后生效。" style={{ marginBottom: 16 }} />
      <Input.Search
        placeholder="搜索角色名称或 ID"
        allowClear
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        style={{ marginBottom: 16 }}
      />
      <Space style={{ marginBottom: 16 }}>
        <Button
          size="small"
          disabled={!canWrite || !ready}
          onClick={() => setSelected(roles.map((role) => role.authorityId))}
        >
          全选
        </Button>
        <Button size="small" disabled={!canWrite || !ready} onClick={() => setSelected([])}>
          清空
        </Button>
        <span>已选择 {selected.length} 个角色</span>
      </Space>
      <Spin spinning={loading}>
        {ready && (
          <Tree
            checkable
            checkStrictly
            selectable={false}
            defaultExpandAll
            treeData={treeData}
            checkedKeys={selected}
            filterTreeNode={(node) =>
              String(node.title).toLowerCase().includes(filter.toLowerCase())
            }
            onCheck={(keys) => setSelected((Array.isArray(keys) ? keys : keys.checked).map(Number))}
          />
        )}
      </Spin>
    </Drawer>
  );
}
