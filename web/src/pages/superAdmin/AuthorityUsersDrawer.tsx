import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Role membership editor preserves selections across user pages.
import { useCallback, useEffect, useState } from 'react';
import { App, Avatar, Button, Drawer, Select, Spin } from 'antd';
import { authorityApi, userApi } from '../../api/endpoints';
import type { SysAuthority } from '../../domain/authority';
import type { SysUser } from '../../domain/user';

interface Props {
  open: boolean;
  authority: SysAuthority | null;
  onClose: () => void;
}

export default function AuthorityUsersDrawer({ open, authority, onClose }: Props) {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // Internal implementation detail.
  const [users, setUsers] = useState<SysUser[]>([]);
  // Internal implementation detail.
  const [selected, setSelected] = useState<number[]>([]);

  const load = useCallback(async () => {
    if (!authority) return;
    setLoading(true);
    setReady(false);
    try {
      const [userPage, currentIds] = await Promise.all([
        userApi.getUserList({ page: 1, pageSize: 999 }),
        authorityApi.getUsersByAuthorityId(authority.authorityId),
      ]);
      setUsers(userPage.list ?? []);
      setReady(true);
      setSelected(Array.isArray(currentIds) ? currentIds : []);
    } catch {
      // Internal implementation detail.
    } finally {
      setLoading(false);
    }
  }, [authority]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    if (!canWrite) return;
    if (!authority) return;
    setSaving(true);
    try {
      await authorityApi.setRoleUsers({ authorityId: authority.authorityId, userIds: selected });
      message.success('操作成功');
      onClose();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={`角色用户 - ${authority?.authorityName ?? ''}`}
      width={480}
      open={open}
      onClose={onClose}
      destroyOnHidden
      getContainer={() => document.body}
    >
      <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.45)' }}>
        选择此角色包含的用户，用户可继承角色的菜单和数据权限。
      </div>
      <Spin spinning={loading}>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="请选择用户"
          value={selected}
          onChange={setSelected}
          optionLabelProp="label"
          optionFilterProp="label"
          options={users.map((u) => ({
            label: `${u.nickName || u.userName}（${u.userName}）`,
            value: u.ID,
          }))}
          optionRender={(option) => (
            <span>
              <Avatar
                size="small"
                style={{ marginRight: 8, backgroundColor: 'var(--brand-primary)' }}
              >
                {String(option.label ?? '?').slice(0, 1)}
              </Avatar>
              {option.label}
            </span>
          )}
        />
        <div style={{ marginTop: 16 }}>
          <Button
            type="primary"
            loading={saving}
            disabled={!canWrite || !ready || loading}
            onClick={() => void save()}
          >
            保存用户
          </Button>
        </div>
      </Spin>
    </Drawer>
  );
}
