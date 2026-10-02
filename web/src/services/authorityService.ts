// Internal implementation detail.
import { authorityApi, authorityBtnApi, casbinApi, menuApi } from '../api/endpoints';
import type { PageInfo, PageResult } from '../types';
import type { SysAuthority } from '../domain/authority';
import type { CasbinInfo } from '../domain/api';
import type { MenuNode } from '../domain/menu';

export const authorityService = {
  page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysAuthority>> =>
    authorityApi.getAuthorityList({ page: 1, pageSize: 10, ...params }),
  // Internal implementation detail.
  listAll: (): Promise<SysAuthority[]> =>
    authorityApi.getAuthorityList({ page: 1, pageSize: 999 }).then((res) => {
      const result = new Map<number, SysAuthority>();
      const visit = (items: SysAuthority[]) =>
        items.forEach((item) => {
          result.set(item.authorityId, item);
          if (item.children?.length) visit(item.children);
        });
      visit(res.list ?? []);
      return [...result.values()];
    }),
  create: authorityApi.createAuthority,
  update: authorityApi.updateAuthority,
  remove: (authorityId: number) => authorityApi.deleteAuthority({ authorityId }),
  copy: authorityApi.copyAuthority,
  setDataAuthority: authorityApi.setDataAuthority,
  // Internal implementation detail.
  menusOf: (authorityId: number): Promise<{ menus: MenuNode[] }> =>
    menuApi.getMenuAuthority({ authorityId }),
  setMenus: menuApi.addMenuAuthority,
  // Internal implementation detail.
  getBtns: authorityBtnApi.getAuthorityBtn,
  setBtns: authorityBtnApi.setAuthorityBtn,
  /** role API permission（casbin） */
  getApiPaths: (authorityId: number) => casbinApi.getPolicyPathByAuthorityId({ authorityId }),
  setApiPaths: (authorityId: number, casbinInfos: CasbinInfo[]) =>
    casbinApi.updateCasbin({ authorityId, casbinInfos }),
};
