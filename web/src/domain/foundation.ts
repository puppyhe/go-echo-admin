import type { MenuNode } from './menu';

const retiredComponents = new Set([
  'systemTools/pageBuilder',
  'systemTools/toolCollections/cli',
  'systemTools/toolCollections/mcp',
  'systemTools/autoCode/mcp',
  'systemTools/autoCode/mcpTest',
  'systemTools/mcp',
  'systemTools/skills',
  'systemTools/aiWorkflow',
  'systemTools/aiWrokflow',
  'systemTools/plugin',
  'systemTools/installPlugin',
  'systemTools/pubPlug/pubPlug',
]);

function key(component: string): string {
  return component
    .trim()
    .replace(/^\/?view\//, '')
    .replace(/\.vue$/, '')
    .replace(/\/index$/, '');
}

export function isRetiredComponent(component: string): boolean {
  return retiredComponents.has(key(component));
}

/** Keep old saved menus from resurrecting retired pages after an upgrade. */
export function filterFoundationMenus(menus: MenuNode[]): MenuNode[] {
  return menus.flatMap((menu) => {
    if (isRetiredComponent(menu.component)) return [];
    const children = filterFoundationMenus(menu.children ?? []);
    if (
      menu.name === 'aiWorkshop' &&
      menu.path === 'ai' &&
      key(menu.component) === 'routerHolder' &&
      children.length === 0
    )
      return [];
    return [{ ...menu, children }];
  });
}
