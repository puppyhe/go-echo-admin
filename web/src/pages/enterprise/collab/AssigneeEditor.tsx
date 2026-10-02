import { useEffect, useState } from 'react';
import { Alert, Select, Space, Typography } from 'antd';
import { collabApi } from './api';
import { orgApi } from '../../org/api';
import type { Department } from '../../org/types';
import type { AssigneeSpec, RoleChoice, UserChoice } from './types';

type Value = { assignee?: AssigneeSpec; approverIds?: number[] };
export function AssigneeEditor({
  value,
  users,
  onChange,
  disabled,
}: {
  value: Value;
  users: UserChoice[];
  onChange: (value: { assignee?: AssigneeSpec; approverIds: number[] }) => void;
  disabled?: boolean;
}) {
  const kind = value.assignee?.kind ?? 'users';
  const [choices, setChoices] = useState<RoleChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setChoices([]);
    setError('');
    setLoading(false);
    if (kind !== 'role' && kind !== 'department_leader') return;
    setLoading(true);
    const fetchChoices = async () => {
      if (kind === 'role') return collabApi.roles();
      const data = await orgApi.departments();
      const rows: RoleChoice[] = [];
      const visit = (departments: Department[]) =>
        departments.forEach((department) => {
          rows.push({ value: department.id, label: `${department.name} (${department.id})` });
          visit(department.children ?? []);
        });
      visit(data.list ?? []);
      return rows;
    };
    void fetchChoices()
      .then((rows) => {
        if (active) setChoices(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Assignment type');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  const known = ['users', 'role', 'department_leader'].includes(kind);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        aria-label="Assignment type"
        value={kind}
        disabled={disabled}
        style={{ width: '100%' }}
        options={[
          { value: 'users', label: 'Users' },
          { value: 'role', label: 'Role' },
          { value: 'department_leader', label: 'Department leaders' },
          ...(!known ? [{ value: kind, label: `Unsupported assignment: ${kind}` }] : []),
        ]}
        onChange={(next) =>
          onChange({ approverIds: [], assignee: next === 'users' ? undefined : { kind: next } })
        }
      />
      {known && (
        <Select
          aria-label={kind === 'users' ? 'Users' : kind === 'role' ? 'Role' : 'Department leaders'}
          mode="multiple"
          showSearch
          optionFilterProp="label="
          style={{ width: '100%' }}
          disabled={disabled}
          loading={loading}
          value={value.assignee?.ids ?? value.approverIds ?? []}
          options={
            kind === 'users'
              ? users.map((user) => ({
                  value: user.id,
                  label: `${user.nickName || user.username} (${user.username})`,
                }))
              : choices
          }
          placeholder={
            kind === 'department_leader'
              ? 'Select departments'
              : kind === 'role'
                ? 'Select roles'
                : 'Select users'
          }
          onChange={(ids) =>
            onChange(
              kind === 'users'
                ? { approverIds: ids, assignee: undefined }
                : { approverIds: [], assignee: { kind, ...(ids.length ? { ids } : {}) } },
            )
          }
        />
      )}
      {kind !== 'users' && (
        <Typography.Text type="secondary">
          Role and department assignments resolve at approval time.
        </Typography.Text>
      )}
      {!known && (
        <Alert type="info" message="This assignment type is not supported" />
      )}
      {error && (
        <Alert
          type="warning"
          message={error}
          description={
            kind === 'department_leader'
              ? 'Unable to load departments.'
              : 'Unable to load roles.'
          }
        />
      )}
    </Space>
  );
}
