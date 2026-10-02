import { useState, type ReactNode } from 'react';
import { Button, Card, Col, Empty, Popconfirm, Row, Select, Space, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { addTree, changeTree, flattenTree, moveTree } from './model';
export function HierarchyEditor<T extends { children?: T[] }>({
  value,
  onChange,
  create,
  label,
  render,
}: {
  value: T[];
  onChange: (next: T[]) => void;
  create: () => T;
  label: (v: T) => string;
  render: (v: T, patch: (update: Partial<T>) => void, isRoot: boolean) => ReactNode;
}) {
  const [selected, setSelected] = useState<string>();
  const flat = flattenTree(value);
  const current = flat.find((v) => v.key === selected);
  const [error, setError] = useState('');
  const tree = (nodes: T[], prefix = ''): DataNode[] =>
    nodes.map((node, i) => {
      const key = prefix ? `${prefix}.${i}` : String(i);
      return { key, title: label(node) || '未命名', children: tree(node.children ?? [], key) };
    });
  const add = (parent?: string) => {
    const next = addTree(value, parent, create());
    onChange(next);
    setSelected(
      parent === undefined
        ? String(value.length)
        : `${parent}.${current?.node.children?.length ?? 0}`,
    );
  };
  return (
    <Row gutter={16}>
      <Col xs={24} md={8}>
        <Card
          size="small"
          title="层级结构"
          extra={
            <Button size="small" onClick={() => add()}>
              新建
            </Button>
          }
        >
          <Tree
            blockNode
            defaultExpandAll
            key={flat.length}
            selectedKeys={selected ? [selected] : []}
            treeData={tree(value)}
            onSelect={(keys) => setSelected(keys.length ? String(keys[0]) : undefined)}
          />
          {!value.length && (
            <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
      <Col xs={24} md={16}>
        {current ? (
          <Card
            size="small"
            title={label(current.node) || '未命名'}
            extra={
              <Space>
                <Button size="small" onClick={() => add(current.key)}>
                  新增子级
                </Button>
                <Popconfirm
                  title="确认删除该节点吗？"
                  onConfirm={() => {
                    onChange(changeTree(value, current.key, () => null));
                    setSelected(undefined);
                  }}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">父级节点</Typography.Text>
              <Select
                style={{ width: '100%' }}
                value={
                  current.key.includes('.') ? current.key.split('.').slice(0, -1).join('.') : 'root'
                }
                options={[
                  { value: 'root', label: '根节点' },
                  ...flat
                    .filter((v) => v.key !== current.key && !v.key.startsWith(`${current.key}.`))
                    .map((v) => ({ value: v.key, label: label(v.node) || '未命名' })),
                ]}
                onChange={(parent) => {
                  try {
                    onChange(moveTree(value, current.key, parent === 'root' ? undefined : parent));
                    setSelected(undefined);
                    setError('');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              {error && <Typography.Text type="danger">{error}</Typography.Text>}
              {render(
                current.node,
                (patch) =>
                  onChange(changeTree(value, current.key, (node) => ({ ...node, ...patch }))),
                !current.key.includes('.'),
              )}
            </Space>
          </Card>
        ) : (
          <Empty description="请选择要编辑的节点" />
        )}
      </Col>
    </Row>
  );
}
