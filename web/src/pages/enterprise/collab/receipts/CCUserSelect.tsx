import { useEffect, useState } from 'react';
import { Alert, Button, Select, Space, Typography } from 'antd';
import { collabApi } from '../api';
import type { UserChoice } from '../types';

export default function CCUserSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value?: number[];
  onChange?: (ids: number[]) => void;
  options?: { value: number; label: string }[];
  disabled?: boolean;
}) {
  const [users, setUsers] = useState<UserChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (options) return;
    let active = true;
    setLoading(true);
    setError('');
    collabApi
      .users()
      .then((result) => {
        if (active) setUsers(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load users');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [options, retry]);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {error && (
        <Alert
          type="error"
          message={error}
          action={
            <Button size="small" onClick={() => setRetry((v) => v + 1)}>
              retry
            </Button>
          }
        />
      )}
      <Select<number[]>
        mode="multiple"
        showSearch
        allowClear
        optionFilterProp="label="
        loading={loading}
        disabled={disabled}
        style={{ width: '100%' }}
        value={value ?? []}
        maxCount={100}
        placeholder="Select users to copy"
        options={
          options ??
          users.map((user) => ({
            value: user.id,
            label: `${user.nickName || user.username} (#${user.id})`,
          }))
        }
        onChange={onChange}
      />
      <Typography.Text type="secondary">
        Select up to 100 users. The list is filtered by your permissions.
      </Typography.Text>
    </Space>
  );
}
