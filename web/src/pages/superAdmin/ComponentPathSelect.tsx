import { useMemo } from 'react';
import { Cascader, Input, Space } from 'antd';
import { componentKey } from '../../routes/pageKeys';

interface Option {
  value: string;
  label: string;
  children?: Option[];
}
interface Props {
  value?: string;
  onChange?: (value: string) => void;
  paths: string[];
}

// Internal implementation detail.
export default function ComponentPathSelect({ value, onChange, paths }: Props) {
  const options = useMemo(() => {
    const roots: Option[] = [];
    [...new Set(paths.map(componentKey))]
      .filter(Boolean)
      .sort()
      .forEach((path) => {
        const parts = path.split('/');
        let siblings = roots;
        parts.forEach((part, index) => {
          let node = siblings.find((option) => option.value === part);
          if (!node) {
            node = { value: part, label: part };
            siblings.push(node);
          }
          if (index < parts.length - 1) {
            node.children ??= [];
            siblings = node.children;
          }
        });
      });
    return roots;
  }, [paths]);

  return (
    <Space.Compact block>
      <Input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder="选择页面组件，例如业务/商品"
        maxLength={255}
      />
      <Cascader
        style={{ width: 170, flexShrink: 0 }}
        options={options}
        placeholder="选择页面"
        value={value ? componentKey(value).split('/') : undefined}
        displayRender={() => '选择页面'}
        allowClear={false}
        expandTrigger="hover"
        showSearch={{
          filter: (input, path) =>
            path
              .map((option) => option.label)
              .join('/')
              .toLowerCase()
              .includes(input.toLowerCase()),
        }}
        onChange={(parts) => onChange?.(parts.map(String).join('/'))}
      />
    </Space.Compact>
  );
}
