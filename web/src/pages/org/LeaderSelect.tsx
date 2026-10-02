import { useEffect, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import { orgApi } from './api';
import type { OrgUser } from './types';
export default function LeaderSelect({
  value,
  onChange,
  selected,
  onUserChange,
  disabled,
}: {
  value?: number | null;
  onChange?: (value: number | null) => void;
  selected: OrgUser | null;
  onUserChange: (value: OrgUser | null) => void;
  disabled?: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  useEffect(() => {
    const current = ++serial.current;
    setLoading(true);
    const timer = setTimeout(() => {
      void orgApi
        .users({ page: 1, pageSize: 50, keyword, onlyEnabled: true })
        .then((data) => {
          if (current === serial.current) {
            setUsers(data.list);
            setError('');
          }
        })
        .catch((e) => {
          if (current === serial.current) setError(e instanceof Error ? e.message : '加载失败');
        })
        .finally(() => {
          if (current === serial.current) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      serial.current++;
    };
  }, [keyword]);
  const options =
    selected && !users.some((user) => user.id === selected.id) ? [selected, ...users] : users;
  return (
    <Select
      value={value ?? undefined}
      allowClear
      showSearch
      filterOption={false}
      onSearch={setKeyword}
      placeholder="搜索并选择用户"
      disabled={disabled}
      loading={loading}
      options={options.map((user) => ({
        value: user.id,
        label: `${user.nickName || user.username}（${user.username}）`,
      }))}
      notFoundContent={loading ? <Spin size="small" /> : error || '暂无用户'}
      onChange={(id) => {
        onChange?.(id ?? null);
        onUserChange(options.find((user) => user.id === id) ?? null);
      }}
    />
  );
}
