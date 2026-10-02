import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Space, Spin } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { sysDictionaryApi } from '../../api/endpoints';
import type { SysDictionary } from '../../domain/dictionary';
import DictionaryDetailsPanel from './dictionary/DictionaryDetailsPanel';
import './dictionary/dictionary.css';

/** Keep existing detail bookmarks working while the primary workspace shows both panels. */
export default function DictionaryDetailPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('sysDictionaryID'));
  const [dictionary, setDictionary] = useState<SysDictionary | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setDictionary(null);
    setError('');
    if (!Number.isSafeInteger(id) || id <= 0) return;
    void sysDictionaryApi
      .findSysDictionary({ ID: id })
      .then((data) => {
        if (alive) setDictionary(data.resysDictionary);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);
  if (!Number.isSafeInteger(id) || id <= 0)
    return (
      <Empty description="请选择一个字典查看字典项">
        <Link to="/superAdmin/dictionary">返回字典管理</Link>
      </Empty>
    );
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Link to={`/superAdmin/dictionary?sysDictionaryID=${id}`}>返回字典管理</Link>
      {error ? (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={() => setRevision((n) => n + 1)}>重试</Button>}
        />
      ) : dictionary ? (
        <DictionaryDetailsPanel key={id} dictionary={dictionary} />
      ) : (
        <Spin />
      )}
    </Space>
  );
}
