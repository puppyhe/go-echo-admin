// Internal implementation detail.
import { menuApi } from '../api/endpoints';
import { session } from '../api/request';
import type { MenuNode } from '../domain/menu';
import { filterFoundationMenus } from '../domain/foundation';

// Internal implementation detail.
export async function getMenu(): Promise<MenuNode[]> {
  const result = await menuApi.asyncMenu();
  return filterFoundationMenus(result.menus ?? []);
}

// Internal implementation detail.
export const sessionSnapshot = {
  get: session.getSnapshot,
  clear: session.clear,
};
