import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Drawer, Space, Spin } from 'antd';
import { authorityService } from '../../services/authorityService';
import type { SysAuthority } from '../../domain/authority';

interface Props {
  open: boolean;
  authority: SysAuthority | null;
  onClose: () => void;
  onSuccess?: () => void;
  embedded?: boolean;
}

export default function AuthorityDataDrawer({
  open,
  authority,
  onClose,
  onSuccess,
  embedded = false,
}: Props) {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<SysAuthority[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (!open || !authority) return;
    let active = true;
    setLoading(true);
    setReady(false);
    void authorityService
      .listAll()
      .then((list) => {
        if (!active) return;
        setRoles(list);
        setSelected((authority.dataAuthorityId ?? []).map((role) => role.authorityId));
        setReady(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, authority]);

  const selfAndChildren = useMemo(() => {
    const ids = new Set<number>();
    if (authority) ids.add(authority.authorityId);
    let changed = true;
    while (changed) {
      changed = false;
      roles.forEach((role) => {
        if (ids.has(role.parentId ?? 0) && !ids.has(role.authorityId)) {
          ids.add(role.authorityId);
          changed = true;
        }
      });
    }
    return [...ids];
  }, [roles, authority]);

  const save = async () => {
    if (!canWrite) return;
    if (!authority || !ready) return;
    setSaving(true);
    try {
      await authorityService.setDataAuthority({
        authorityId: authority.authorityId,
        dataAuthorityId: roles
          .filter((role) => selected.includes(role.authorityId))
          .map((role) => ({ ...role, children: [], dataAuthorityId: [] })),
      });
      message.success('操作成功');
      onSuccess?.();
      if (!embedded) onClose();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <>
      <Alert
        type="info"
        showIcon
        message="数据权限用于限制当前角色可查看的部门、角色或其他数据范围，请选择数据范围。"
        style={{ marginBottom: 20 }}
      />
      <Space wrap style={{ marginBottom: 24 }}>
        <Button
          disabled={!canWrite || !ready}
          onClick={() => setSelected(roles.map((role) => role.authorityId))}
        >
          选择全部角色
        </Button>
        <Button
          disabled={!canWrite || !ready || !authority}
          onClick={() => setSelected(authority ? [authority.authorityId] : [])}
        >
          仅当前角色
        </Button>
        <Button disabled={!canWrite || !ready} onClick={() => setSelected(selfAndChildren)}>
          当前角色及子角色
        </Button>
        <Button
          type="primary"
          disabled={!canWrite || !ready}
          loading={saving}
          onClick={() => void save()}
        >
          保存配置
        </Button>
      </Space>
      <Spin spinning={loading}>
        <Checkbox.Group
          value={selected}
          onChange={(values) => setSelected(values.map(Number))}
          style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
          options={roles.map((role) => ({ label: role.authorityName, value: role.authorityId }))}
        />
      </Spin>
    </>
  );
  return embedded ? (
    content
  ) : (
    <Drawer
      title={`角色数据权限 - ${authority?.authorityName ?? ''}`}
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      getContainer={() => document.body}
    >
      {content}
    </Drawer>
  );
}
