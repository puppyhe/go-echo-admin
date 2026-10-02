import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Role menu assignment preserves parent navigation and selected leaf routes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key, ReactNode } from 'react';
import { App, Button, Drawer, Empty, Input, Modal, Select, Space, Spin, Table, Tree } from 'antd';
import type { TableColumnsType } from 'antd';
import { HomeFilled } from '@ant-design/icons';
import { menuApi } from '../../api/endpoints';
import { authorityService } from '../../services/authorityService';
import type { SysAuthority } from '../../domain/authority';
import type { MenuBtn, MenuNode } from '../../domain/menu';

export interface AuthorityMenusDrawerProps {
  open: boolean;
  authority: SysAuthority | null;
  onClose: () => void;
  // Internal implementation detail.
  onSuccess?: () => void;
  embedded?: boolean;
}

// Internal implementation detail.
interface MenuTreeNode {
  key: Key;
  title: ReactNode;
  disabled?: boolean;
  children?: MenuTreeNode[];
}

// Internal implementation detail.
function isExternalRoute(name: string): boolean {
  return name.startsWith('http://') || name.startsWith('https://');
}

// Internal implementation detail.
function findMenuByName(menus: MenuNode[], name: string): MenuNode | null {
  for (const item of menus) {
    if (item.name === name) return item;
    if (item.children?.length) {
      const found = findMenuByName(item.children, name);
      if (found) return found;
    }
  }
  return null;
}

export default function AuthorityMenusDrawer({
  open,
  authority,
  onClose,
  onSuccess,
  embedded = false,
}: AuthorityMenusDrawerProps) {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();
  const authorityId = authority?.authorityId ?? 0;

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [menuTree, setMenuTree] = useState<MenuNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [filterText, setFilterText] = useState('');
  // Internal implementation detail.
  const [defaultRouter, setDefaultRouter] = useState('');
  const [saving, setSaving] = useState(false);
  const [routerSaving, setRouterSaving] = useState(false);

  // Internal implementation detail.
  const [btnOpen, setBtnOpen] = useState(false);
  const [btnMenu, setBtnMenu] = useState<MenuNode | null>(null);
  const [btnSelected, setBtnSelected] = useState<number[]>([]);
  const [btnLoading, setBtnLoading] = useState(false);
  const [btnSaving, setBtnSaving] = useState(false);

  // Internal implementation detail.
  const seqRef = useRef(0);

  // Internal implementation detail.
  useEffect(() => {
    if (!open || !authorityId) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setReady(false);
    setFilterText('');
    setDefaultRouter(authority?.defaultRouter ?? '');
    void Promise.all([menuApi.getBaseMenuTree(), authorityService.menusOf(authorityId)])
      .then(([treeRes, authorityRes]) => {
        if (seq !== seqRef.current) return;
        const tree = treeRes.menus ?? [];
        setMenuTree(tree);
        // Internal implementation detail.
        const allKeys: Key[] = [];
        const walkKeys = (nodes: MenuNode[]) => {
          nodes.forEach((node) => {
            allKeys.push(node.ID);
            if (node.children?.length) walkKeys(node.children);
          });
        };
        walkKeys(tree);
        setExpandedKeys(allKeys);
        // Internal implementation detail.
        const menus: MenuNode[] = [];
        const flatten = (items: MenuNode[]) =>
          items.forEach((item) => {
            menus.push(item);
            if (item.children?.length) flatten(item.children);
          });
        flatten(authorityRes.menus ?? []);
        const initialChecked = menus
          .filter((item) => !menus.some((same) => same.parentId === (item.menuId ?? item.ID)))
          .map((item) => Number(item.menuId ?? item.ID));
        setCheckedKeys(initialChecked);
        setReady(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [open, authorityId, authority]);

  // Internal implementation detail.
  const openBtnModal = useCallback(
    async (node: MenuNode) => {
      if (!authorityId) return;
      setBtnMenu(node);
      setBtnSelected([]);
      setBtnOpen(true);
      setBtnLoading(true);
      try {
        const res = await authorityService.getBtns({ menuID: node.ID, authorityId });
        setBtnSelected(res.selected ?? []);
      } catch {
        setBtnOpen(false);
      } finally {
        setBtnLoading(false);
      }
    },
    [authorityId],
  );

  const checkedSet = useMemo(() => new Set<Key>(checkedKeys), [checkedKeys]);

  // Internal implementation detail.
  const halfCheckedSet = useMemo(() => {
    const half = new Set<Key>();
    const walk = (nodes: MenuNode[]): boolean => {
      let hasChecked = false;
      for (const node of nodes) {
        const childHas = node.children?.length ? walk(node.children) : false;
        const self = checkedSet.has(node.ID);
        if (!self && childHas) half.add(node.ID);
        if (self || childHas) hasChecked = true;
      }
      return hasChecked;
    };
    walk(menuTree);
    return half;
  }, [menuTree, checkedSet]);

  // Internal implementation detail.
  const sendMenus = useMemo(() => {
    const result: MenuNode[] = [];
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        if (checkedSet.has(node.ID) || halfCheckedSet.has(node.ID)) result.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(menuTree);
    return result;
  }, [menuTree, checkedSet, halfCheckedSet]);

  // Internal implementation detail.
  const checkedRouterNames = useMemo(() => {
    const names = new Set<string>();
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        if ((checkedSet.has(node.ID) || halfCheckedSet.has(node.ID)) && node.name)
          names.add(node.name);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(menuTree);
    return names;
  }, [menuTree, checkedSet, halfCheckedSet]);

  // Internal implementation detail.
  const routerOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        const picked = checkedSet.has(node.ID) || halfCheckedSet.has(node.ID);
        if (picked && node.name && !isExternalRoute(node.name)) {
          options.push({ label: node.meta?.title || node.name, value: node.name });
        }
        if (node.children?.length) walk(node.children);
      }
    };
    walk(menuTree);
    if (defaultRouter && !checkedRouterNames.has(defaultRouter)) {
      const found = findMenuByName(menuTree, defaultRouter);
      if (found && !isExternalRoute(found.name)) {
        options.push({ label: found.meta?.title || found.name, value: found.name });
      }
    }
    return options;
  }, [menuTree, checkedSet, halfCheckedSet, defaultRouter, checkedRouterNames]);

  // Internal implementation detail.
  const buildTreeData = useCallback(
    (nodes: MenuNode[]): MenuTreeNode[] =>
      nodes.map((node) => {
        const isHome = node.name === defaultRouter;
        return {
          key: node.ID,
          // Internal implementation detail.
          disabled: isHome && checkedSet.has(node.ID),
          title: (
            <Space size={6}>
              <span>{node.meta?.title ?? node.name}</span>
              {isHome && <HomeFilled style={{ color: 'var(--brand-primary)' }} />}
              {Boolean(node.menuBtn?.length) && (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    void openBtnModal(node);
                  }}
                >
                  按钮权限
                </Button>
              )}
            </Space>
          ),
          children: node.children?.length ? buildTreeData(node.children) : undefined,
        };
      }),
    [defaultRouter, checkedSet, openBtnModal],
  );

  // Internal implementation detail.
  const filteredTree = useMemo(() => {
    const text = filterText.trim();
    if (!text) return menuTree;
    const filter = (nodes: MenuNode[]): MenuNode[] => {
      const result: MenuNode[] = [];
      for (const node of nodes) {
        const keptChildren = node.children?.length ? filter(node.children) : [];
        if ((node.meta?.title ?? '').includes(text) || keptChildren.length) {
          result.push({ ...node, children: keptChildren });
        }
      }
      return result;
    };
    return filter(menuTree);
  }, [menuTree, filterText]);

  const treeData = useMemo(() => buildTreeData(filteredTree), [buildTreeData, filteredTree]);

  // Internal implementation detail.
  const filteredAllKeys = useMemo(() => {
    if (!filterText.trim()) return null;
    const keys: Key[] = [];
    const walk = (nodes: MenuNode[]) => {
      nodes.forEach((node) => {
        keys.push(node.ID);
        if (node.children?.length) walk(node.children);
      });
    };
    walk(filteredTree);
    return keys;
  }, [filteredTree, filterText]);

  // Internal implementation detail.
  const saveMenus = useCallback(async (): Promise<boolean> => {
    if (!canWrite) return false;
    if (!authorityId) return false;
    setSaving(true);
    try {
      await authorityService.setMenus({ menus: sendMenus, authorityId });
      message.success('菜单保存成功！');
      onSuccess?.();
      return true;
    } catch {
      return false; // failure messages are normalized by the request layer toast
    } finally {
      setSaving(false);
    }
  }, [authorityId, sendMenus, message, onSuccess, canWrite]);

  // Internal implementation detail.
  const onRouterChange = async (val: string) => {
    if (!canWrite) return;
    if (!authority || !val) return;
    if (!checkedRouterNames.has(val)) {
      message.warning('该菜单未授权，请先选择已授权的菜单');
      return;
    }
    setRouterSaving(true);
    try {
      await authorityService.update({
        ...authority,
        // Internal implementation detail.
        children: [],
        dataAuthorityId: authority.dataAuthorityId ?? [],
        defaultRouter: val,
      });
      setDefaultRouter(val);
      await saveMenus();
    } catch {
      // Internal implementation detail.
    } finally {
      setRouterSaving(false);
    }
  };

  // Internal implementation detail.
  const saveBtns = async () => {
    if (!canWrite) return;
    if (!btnMenu || !authorityId) return;
    setBtnSaving(true);
    try {
      await authorityService.setBtns({ menuID: btnMenu.ID, authorityId, selected: btnSelected });
      message.success('操作成功');
      setBtnOpen(false);
    } catch {
      // Internal implementation detail.
    } finally {
      setBtnSaving(false);
    }
  };

  const btnColumns: TableColumnsType<MenuBtn> = [
    { title: '按钮名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'desc', key: 'desc' },
  ];

  const isFiltering = filterText.trim().length > 0;

  const content = (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="搜索菜单"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <Button
          type="primary"
          loading={saving}
          disabled={!canWrite || !ready || loading}
          onClick={() => void saveMenus()}
        >
          保存菜单权限
        </Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ whiteSpace: 'nowrap' }}>默认首页：</span>
        <Select
          style={{ flex: 1, minWidth: 0 }}
          showSearch
          optionFilterProp="label"
          placeholder="选择默认首页"
          value={defaultRouter || undefined}
          options={routerOptions}
          loading={routerSaving}
          disabled={!canWrite || !ready || loading}
          onChange={(val) => void onRouterChange(val)}
        />
      </div>
      <Spin spinning={loading}>
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
          <Tree
            checkable
            checkStrictly={false}
            selectable={false}
            checkedKeys={checkedKeys}
            onCheck={(checked) => setCheckedKeys(checked as Key[])}
            expandedKeys={isFiltering && filteredAllKeys ? filteredAllKeys : expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as Key[])}
            treeData={treeData}
          />
        </div>
      </Spin>

      <Modal
        title="按钮权限"
        open={btnOpen}
        onOk={() => void saveBtns()}
        onCancel={() => setBtnOpen(false)}
        confirmLoading={btnSaving}
        okButtonProps={{ disabled: !canWrite }}
        destroyOnHidden
        width={520}
      >
        {(btnMenu?.menuBtn?.length ?? 0) === 0 ? (
          <Empty description="暂无可配置按钮" style={{ margin: '24px 0' }} />
        ) : (
          <Table<MenuBtn>
            size="small"
            rowKey="ID"
            loading={btnLoading}
            columns={btnColumns}
            dataSource={btnMenu?.menuBtn ?? []}
            pagination={false}
            rowSelection={{
              selectedRowKeys: btnSelected,
              onChange: (keys) => setBtnSelected(keys as number[]),
            }}
          />
        )}
      </Modal>
    </>
  );
  return embedded ? (
    content
  ) : (
    <Drawer
      title={`菜单权限 - ${authority?.authorityName ?? ''}`}
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
