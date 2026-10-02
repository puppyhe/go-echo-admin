import { session } from '../api/request';
import { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown } from 'antd';
import { CloseOutlined, DownOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMenu } from '../menu/MenuContext';
import { formatMenuTitle, matchingMenus } from '../menu/menuPaths';
import { useAuth } from '../auth/AuthContext';
import { getIcon, getMenuIcon } from './iconMap';
import { translateMenuTitle, zh } from '../locale/zh';

interface TabItem {
  path: string;
  title: string;
  icon: string;
}
export default function TabsBar({ onRefresh }: { onRefresh: () => void }) {
  const key = session.storageKey('gea-tabs');
  const location = useLocation();
  const navigate = useNavigate();
  const { nodeByPath, resolveLandingPath } = useMenu();
  const { user } = useAuth();
  const home = resolveLandingPath(user?.authority?.defaultRouter);
  const active = location.pathname + location.search;
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) || '[]');
      return Array.isArray(saved)
        ? saved.filter((t) => t && typeof t.path === 'string' && typeof t.title === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const homeNode = nodeByPath.get(home);
  const visible = useMemo(() => {
    const valid = tabs
      .filter(
        (tab) => matchingMenus(nodeByPath, tab.path.split('?')[0]).length > 0 && tab.path !== home,
      )
      .map((tab) => {
        if (!/^(?:ai\s+)?description$/i.test(tab.title))
          return { ...tab, title: translateMenuTitle(tab.title) };
        const match = matchingMenus(nodeByPath, tab.path.split('?')[0]).at(-1);
        const title = translateMenuTitle(
          match?.[1].meta.title || '',
          match?.[1].name || tab.path.split('?')[0].split('/').filter(Boolean).at(-1) || 'Page',
        );
        return match ? { ...tab, title } : { ...tab, title: translateMenuTitle(tab.title) };
      });
    return homeNode
      ? [
          {
            path: home,
            title: '首页',
            icon: homeNode.meta.icon,
          },
          ...valid,
        ]
      : valid;
  }, [tabs, home, homeNode, nodeByPath]);
  useEffect(() => {
    const match = matchingMenus(nodeByPath, location.pathname).at(-1);
    const node = match?.[1];
    if (!node || node.meta.closeTab) return;
    const title = location.pathname.endsWith('/dictionary/detail')
      ? 'dictionarydetails'
      : translateMenuTitle(
          formatMenuTitle(
            node.meta.title || node.name,
            match![0],
            location.pathname,
            location.search,
          ),
          node.name || match![0],
        );
    setTabs((prev) =>
      prev.some((t) => t.path === active && t.title === title)
        ? prev
        : [...prev.filter((t) => t.path !== active), { path: active, title, icon: node.meta.icon }],
    );
  }, [active, location.pathname, nodeByPath]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(visible));
    } catch {
      // Internal implementation detail.
    }
    window.dispatchEvent(
      new CustomEvent('gea-tabs-change', { detail: visible.map((tab) => tab.path) }),
    );
  }, [visible]);
  useEffect(() => {
    document
      .querySelector('.tab-chip.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, visible.length]);
  const close = (target: string) => {
    if (target === home) return;
    const index = visible.findIndex((t) => t.path === target);
    const next = visible.filter((t) => t.path !== target);
    setTabs(next);
    if (target === active) navigate(next[Math.max(0, index - 1)]?.path || home);
  };
  const operate = (action: string, target = active) => {
    if (action === 'refresh') {
      if (target !== active) navigate(target);
      onRefresh();
      return;
    }
    if (action === 'current') {
      close(target);
      return;
    }
    const index = visible.findIndex((t) => t.path === target);
    const next = visible.filter(
      (tab, i) =>
        tab.path === home ||
        (action === 'others'
          ? tab.path === target
          : action === 'left'
            ? i >= index
            : action === 'right'
              ? i <= index
              : false),
    );
    setTabs(next);
    if (!next.some((tab) => tab.path === active))
      navigate(next.find((tab) => tab.path === target)?.path || home);
  };
  const actions = [
    { key: 'refresh', label: zh['refresh'], icon: <ReloadOutlined /> },
    { key: 'current', label: zh['closeCurrentTab'] },
    { key: 'others', label: zh['closeOtherTabs'] },
    { key: 'left', label: zh['closeTabsLeft'] },
    { key: 'right', label: zh['closeTabsRight'] },
    { key: 'all', label: zh['closeAllTabs'] },
  ];
  const tabIcon = (tab: TabItem) => {
    const match = matchingMenus(nodeByPath, tab.path.split('?')[0]).at(-1);
    return match ? getMenuIcon({ ...match[1], path: match[0] }) : getIcon(tab.icon);
  };
  // Keep the home view visually quiet. The tab strip appears as soon as the
  // user opens a second page, where it becomes useful for navigation.
  if (visible.length <= 1) return null;
  return (
    <nav className="tabs-bar" aria-label={zh['page']}>
      <div className="tabs-scroll">
        {visible.map((tab) => (
          <Dropdown
            key={tab.path}
            trigger={['contextMenu']}
            menu={{ items: actions, onClick: ({ key: action }) => operate(action, tab.path) }}
          >
            <div className={`tab-chip${tab.path === active ? ' active' : ''}`}>
              <button
                className="tab-target"
                onClick={() => navigate(tab.path)}
                aria-current={tab.path === active ? 'page' : undefined}
              >
                {tabIcon(tab)}
                <span>{tab.title}</span>
              </button>
              {tab.path !== home && (
                <button
                  className="tab-close"
                  aria-label={`${zh['closeTab']} ${tab.title}`}
                  onClick={() => close(tab.path)}
                >
                  <CloseOutlined />
                </button>
              )}
            </div>
          </Dropdown>
        ))}
      </div>
      <Dropdown menu={{ items: actions, onClick: ({ key: action }) => operate(action) }}>
        <Button type="text" aria-label={zh['tabActions']} icon={<DownOutlined />} />
      </Dropdown>
    </nav>
  );
}
