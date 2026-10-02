// Internal implementation detail.
// Internal implementation detail.
import {
  ApiError,
  assertSession,
  sessionHeaders,
  checkSessionResponse,
  postForm,
  request,
  session,
} from './request';
import { toastError } from './feedback';
import { readLlmResponse, type LlmProgress } from '../domain/llmStream';
import {
  normalizeAuthority,
  normalizeMenu,
  normalizeServerInfo,
  normalizeUser,
  withID,
} from './normalize';
import { downloadByUrl, saveDownloadResponse } from './download';
import type { PageResult, PageInfo } from '../types';
import type {
  CaptchaResult,
  ChangePasswordPayload,
  LoginPayload,
  LoginResult,
  RegisterPayload,
  SysUser,
  UserInfoResult,
} from '../domain/user';
import type {
  CopyAuthorityPayload,
  CreateAuthorityPayload,
  SetDataAuthorityPayload,
  SysAuthority,
} from '../domain/authority';
import type { MenuBtn, MenuNode } from '../domain/menu';
import type { CasbinInfo, SysApi, SysApiPayload } from '../domain/api';
import type {
  DictionaryTreeNode,
  FindSysDictionaryResult,
  SysDictionary,
  SysDictionaryDetail,
} from '../domain/dictionary';
import type { SysLoginLog, SysOperationRecord, SysParams } from '../domain/system';
import type {
  AttachmentCategoryNode,
  ExportVersionPayload,
  Info,
  InfoDataSource,
  ServerInfo,
  SysApiToken,
  SysError,
  SysErrorReport,
  SysExportTemplate,
  SysVersion,
  VersionImportResult,
} from '../domain/systemTools';
import type { AutoCodeColumn, AutoCodeForm, SysHistory, SysPackage } from '../domain/autoCode';

// ========== user.js ==========
export const userApi = {
  // Internal implementation detail.
  async login(data: LoginPayload): Promise<LoginResult> {
    const result = await request<LoginResult>('/base/login', {
      method: 'POST',
      body: data,
      anonymous: true,
    });
    return { ...result, user: normalizeUser(result.user) };
  },
  // Internal implementation detail.
  captcha: () => request<CaptchaResult>('/base/captcha', { method: 'POST', anonymous: true }),
  // Internal implementation detail.
  register: (data: RegisterPayload) =>
    request<void>('/user/admin_register', { method: 'POST', body: data }),
  // Internal implementation detail.
  changePassword: (data: ChangePasswordPayload) =>
    request<void>('/user/changePassword', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getUserList(data: PageInfo): Promise<PageResult<SysUser>> {
    const res = await request<PageResult<SysUser>>('/user/getUserList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map(normalizeUser) };
  },
  // Internal implementation detail.
  setUserAuthority: (data: { ID?: number; authorityId: number }) =>
    request<void>('/user/setUserAuthority', { method: 'POST', body: data }),
  /** deleteuser（DELETE + JSON body） */
  deleteUser: (data: { ID: number }) =>
    request<void>('/user/deleteUser', { method: 'DELETE', body: data }),
  // Internal implementation detail.
  setUserInfo: (data: Partial<SysUser>) =>
    request<SysUser>('/user/setUserInfo', { method: 'PUT', body: data }),
  // Internal implementation detail.
  setSelfInfo: (data: Partial<SysUser>) =>
    request<void>('/user/setSelfInfo', { method: 'PUT', body: data }),
  // Internal implementation detail.
  setSelfSetting: (data: Record<string, unknown>) =>
    request<void>('/user/setSelfSetting', { method: 'PUT', body: data }),
  // Internal implementation detail.
  setUserAuthorities: (data: { ID: number; authorityIds: number[] }) =>
    request<void>('/user/setUserAuthorities', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getUserInfo(): Promise<SysUser> {
    const d = await request<UserInfoResult | SysUser>('/user/getUserInfo', { method: 'GET' });
    return normalizeUser('userInfo' in d ? d.userInfo : d);
  },
  // Internal implementation detail.
  resetPassword: (data: { ID: number; password: string }) =>
    request<void>('/user/resetPassword', { method: 'POST', body: data }),
};

// ========== menu.js ==========
export const menuApi = {
  // Internal implementation detail.
  async asyncMenu(): Promise<{ menus: MenuNode[] }> {
    const res = await request<{ menus?: unknown[] }>('/menu/getMenu', { method: 'POST' });
    return { menus: (res.menus ?? []).map(normalizeMenu) };
  },
  // Internal implementation detail.
  async getMenuList(data: PageInfo): Promise<PageResult<MenuNode>> {
    const res = await request<PageResult<MenuNode>>('/menu/getMenuList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map(normalizeMenu) };
  },
  /** createbasemenu */
  addBaseMenu: (data: Partial<MenuNode>) =>
    request<void>('/menu/addBaseMenu', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getBaseMenuTree(): Promise<{ menus: MenuNode[] }> {
    const res = await request<{ menus?: unknown[] } | unknown[]>('/menu/getBaseMenuTree', {
      method: 'POST',
    });
    const arr = Array.isArray(res) ? res : (res.menus ?? []);
    return { menus: arr.map(normalizeMenu) };
  },
  // Internal implementation detail.
  addMenuAuthority: (data: { menus: MenuNode[]; authorityId: number }) =>
    request<void>('/menu/addMenuAuthority', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getMenuAuthority(data: { authorityId: number }): Promise<{ menus: MenuNode[] }> {
    const res = await request<{ menus?: unknown[] } | unknown[]>('/menu/getMenuAuthority', {
      method: 'POST',
      body: data,
    });
    const arr = Array.isArray(res) ? res : (res.menus ?? []);
    return { menus: arr.map(normalizeMenu) };
  },
  /** deletemenu */
  deleteBaseMenu: (data: { ID: number }) =>
    request<void>('/menu/deleteBaseMenu', { method: 'POST', body: data }),
  /** editmenu */
  updateBaseMenu: (data: Partial<MenuNode>) =>
    request<Partial<MenuNode>>('/menu/updateBaseMenu', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getBaseMenuById(data: { ID: number }): Promise<{ menu: MenuNode }> {
    const res = await request<{ menu?: unknown }>('/menu/getBaseMenuById', {
      method: 'POST',
      body: data,
    });
    return { menu: normalizeMenu(res.menu) };
  },
  // Internal implementation detail.
  getMenuRoles: (menuId: number) =>
    request<number[]>('/menu/getMenuRoles', { method: 'GET', params: { menuId } }),
  // Internal implementation detail.
  setMenuRoles: (data: { menuId: number; authorityIds: number[] }) =>
    request<void>('/menu/setMenuRoles', { method: 'POST', body: data }),
};

// ========== authority.js ==========
export const authorityApi = {
  // Internal implementation detail.
  async getAuthorityList(data: PageInfo): Promise<PageResult<SysAuthority>> {
    const res = await request<PageResult<SysAuthority>>('/authority/getAuthorityList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map(normalizeAuthority) };
  },
  /** deleterole */
  deleteAuthority: (data: { authorityId: number }) =>
    request<void>('/authority/deleteAuthority', { method: 'POST', body: data }),
  // Internal implementation detail.
  async createAuthority(data: CreateAuthorityPayload): Promise<SysAuthority> {
    const res = await request<unknown>('/authority/createAuthority', {
      method: 'POST',
      body: data,
    });
    return res !== null && typeof res === 'object'
      ? normalizeAuthority(res)
      : (res as SysAuthority);
  },
  // Internal implementation detail.
  copyAuthority: (data: CopyAuthorityPayload) =>
    request<void>('/authority/copyAuthority', { method: 'POST', body: data }),
  // Internal implementation detail.
  setDataAuthority: (data: SetDataAuthorityPayload) =>
    request<void>('/authority/setDataAuthority', { method: 'POST', body: data }),
  // Internal implementation detail.
  async updateAuthority(data: SysAuthority): Promise<SysAuthority> {
    const res = await request<unknown>('/authority/updateAuthority', { method: 'PUT', body: data });
    return res !== null && typeof res === 'object'
      ? normalizeAuthority(res)
      : (res as SysAuthority);
  },
  // Internal implementation detail.
  getUsersByAuthorityId: (authorityId: number) =>
    request<number[]>('/authority/getUsersByAuthority', { method: 'GET', params: { authorityId } }),
  // Internal implementation detail.
  setRoleUsers: (data: { authorityId: number; userIds: number[] }) =>
    request<void>('/authority/setRoleUsers', { method: 'POST', body: data }),
};

// ========== authorityBtn.js ==========
export const authorityBtnApi = {
  // Internal implementation detail.
  getAuthorityBtn: (data: { menuID: number; authorityId: number }) =>
    request<{ selected: number[] }>('/authorityBtn/getAuthorityBtn', {
      method: 'POST',
      body: data,
    }),
  // Internal implementation detail.
  setAuthorityBtn: (data: { menuID: number; authorityId: number; selected: number[] }) =>
    request<void>('/authorityBtn/setAuthorityBtn', { method: 'POST', body: data }),
  // Internal implementation detail.
  canRemoveAuthorityBtn: (id: number) =>
    request<void>('/authorityBtn/canRemoveAuthorityBtn', { method: 'POST', params: { id } }),
};

// ========== casbin.js ==========
export const casbinApi = {
  // Internal implementation detail.
  updateCasbin: (data: { authorityId: number; casbinInfos: CasbinInfo[] }) =>
    request<void>('/casbin/updateCasbin', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getPolicyPathByAuthorityId(data: {
    authorityId: number;
  }): Promise<{ paths: CasbinInfo[] }> {
    const res = await request<{ paths?: CasbinInfo[] } | CasbinInfo[]>(
      '/casbin/getPolicyPathByAuthorityId',
      { method: 'POST', body: data },
    );
    return { paths: Array.isArray(res) ? res : (res.paths ?? []) };
  },
};

// ========== api.js ==========
export const sysApiApi = {
  // Internal implementation detail.
  async getApiList(data: PageInfo): Promise<PageResult<SysApi>> {
    const res = await request<PageResult<SysApi>>('/api/getApiList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  /** createbase api */
  createApi: (data: SysApiPayload) =>
    request<void>('/api/createApi', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getApiById(data: { ID: number }): Promise<{ api: SysApi }> {
    const res = await request<{ api: SysApi }>('/api/getApiById', { method: 'POST', body: data });
    return { api: withID(res.api) };
  },
  /** update api */
  updateApi: (data: SysApiPayload) =>
    request<void>('/api/updateApi', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getAllApis(): Promise<{ apis: SysApi[] }> {
    const res = await request<{ apis?: SysApi[] }>('/api/getAllApis', { method: 'POST' });
    return { apis: (res.apis ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  deleteApi: (data: SysApiPayload) =>
    request<void>('/api/deleteApi', { method: 'POST', body: data }),
  // Internal implementation detail.
  deleteApisByIds: (data: { ids: number[] }) =>
    request<void>('/api/deleteApisByIds', { method: 'DELETE', body: data }),
  // Internal implementation detail.
  freshCasbin: () => request<void>('/api/freshCasbin', { method: 'GET' }),
  // Internal implementation detail.
  syncApi: () =>
    request<{ newApis: SysApi[]; deleteApis: SysApi[]; ignoreApis: SysApi[] }>('/api/syncApi', {
      method: 'GET',
    }),
  // Internal implementation detail.
  getApiGroups: () =>
    request<{ groups: string[]; groupApiMap: Record<string, string> }>('/api/getApiGroups', {
      method: 'GET',
    }),
  // Internal implementation detail.
  ignoreApi: (data: { path: string; method: string; flag: boolean }) =>
    request<void>('/api/ignoreApi', { method: 'POST', body: data }),
  // Internal implementation detail.
  enterSyncApi: (data: Record<string, unknown>) =>
    request<void>('/api/enterSyncApi', { method: 'POST', body: data }),
  // Internal implementation detail.
  getApiRoles: (path: string, method: string) =>
    request<number[]>('/api/getApiRoles', { method: 'GET', params: { path, method } }),
  // Internal implementation detail.
  setApiRoles: (data: { path: string; method: string; authorityIds: number[] }) =>
    request<void>('/api/setApiRoles', { method: 'POST', body: data }),
};

// ========== sysDictionary.js ==========
export const sysDictionaryApi = {
  /** createdictionary */
  createSysDictionary: (data: Partial<SysDictionary>) =>
    request<void>('/sysDictionary/createSysDictionary', { method: 'POST', body: data }),
  /** deletedictionary（DELETE + JSON body） */
  deleteSysDictionary: (data: Partial<SysDictionary>) =>
    request<void>('/sysDictionary/deleteSysDictionary', { method: 'DELETE', body: data }),
  /** updatedictionary */
  updateSysDictionary: (data: Partial<SysDictionary>) =>
    request<void>('/sysDictionary/updateSysDictionary', { method: 'PUT', body: data }),
  // Internal implementation detail.
  async findSysDictionary(params: { ID: number }): Promise<FindSysDictionaryResult> {
    const res = await request<FindSysDictionaryResult | SysDictionary>(
      '/sysDictionary/findSysDictionary',
      { method: 'GET', params: { id: params.ID } },
    );
    return { resysDictionary: withID('resysDictionary' in res ? res.resysDictionary : res) };
  },
  // Internal implementation detail.
  async getSysDictionaryList(params: PageInfo): Promise<PageResult<SysDictionary>> {
    const res = await request<PageResult<SysDictionary> | SysDictionary[]>(
      '/sysDictionary/getSysDictionaryList',
      { method: 'GET', params },
    );
    if (Array.isArray(res))
      return {
        list: res.map((item) => withID(item)),
        total: res.length,
        page: 1,
        pageSize: res.length,
      };
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  /** exportdictionary JSON */
  exportSysDictionary: (params: { ID: number }) =>
    request<SysDictionary>('/sysDictionary/exportSysDictionary', { method: 'GET', params }),
  /** importdictionary JSON */
  importSysDictionary: (data: { json: string }) =>
    request<void>('/sysDictionary/importSysDictionary', { method: 'POST', body: data }),
};

// ========== sysDictionaryDetail.js ==========
export const sysDictionaryDetailApi = {
  /** createdictionarydetails */
  createSysDictionaryDetail: (data: Partial<SysDictionaryDetail>) =>
    request<void>('/sysDictionaryDetail/createSysDictionaryDetail', { method: 'POST', body: data }),
  /** deletedictionarydetails（DELETE + JSON body） */
  deleteSysDictionaryDetail: (data: Partial<SysDictionaryDetail>) =>
    request<void>('/sysDictionaryDetail/deleteSysDictionaryDetail', {
      method: 'DELETE',
      body: data,
    }),
  /** updatedictionarydetails */
  updateSysDictionaryDetail: (data: Partial<SysDictionaryDetail>) =>
    request<void>('/sysDictionaryDetail/updateSysDictionaryDetail', { method: 'PUT', body: data }),
  // Internal implementation detail.
  async findSysDictionaryDetail(params: {
    ID: number;
  }): Promise<{ resysDictionaryDetail: SysDictionaryDetail }> {
    const res = await request<{ resysDictionaryDetail: SysDictionaryDetail } | SysDictionaryDetail>(
      '/sysDictionaryDetail/findSysDictionaryDetail',
      { method: 'GET', params: { id: params.ID } },
    );
    return {
      resysDictionaryDetail: withID(
        'resysDictionaryDetail' in res ? res.resysDictionaryDetail : res,
      ),
    };
  },
  // Internal implementation detail.
  async getSysDictionaryDetailList(
    params: PageInfo & { sysDictionaryID?: number },
  ): Promise<PageResult<SysDictionaryDetail>> {
    const res = await request<PageResult<SysDictionaryDetail>>(
      '/sysDictionaryDetail/getSysDictionaryDetailList',
      { method: 'GET', params },
    );
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  getDictionaryTreeList: (params: { sysDictionaryID: number }) =>
    request<{ list: DictionaryTreeNode[] }>('/sysDictionaryDetail/getDictionaryTreeList', {
      method: 'GET',
      params,
    }),
  // Internal implementation detail.
  getDictionaryTreeListByType: (params: { type: string }) =>
    request<{ list: DictionaryTreeNode[] }>('/sysDictionaryDetail/getDictionaryTreeListByType', {
      method: 'GET',
      params,
    }),
  // Internal implementation detail.
  async getDictionaryDetailsByParent(params: {
    sysDictionaryID: number;
    parentID?: number;
    includeChildren?: boolean;
    onlyEnabled?: boolean;
  }): Promise<SysDictionaryDetail[]> {
    const result = await request<{ list: SysDictionaryDetail[] }>(
      '/sysDictionaryDetail/getDictionaryDetailsByParent',
      { params },
    );
    return (result.list ?? []).map(withID);
  },
  // Internal implementation detail.
  async getDictionaryPath(params: { ID: number }): Promise<SysDictionaryDetail[]> {
    const result = await request<{ path: SysDictionaryDetail[] }>(
      '/sysDictionaryDetail/getDictionaryPath',
      { params: { id: params.ID } },
    );
    return (result.path ?? []).map(withID);
  },
};

// ========== sysOperationRecord.js ==========
export const sysOperationRecordApi = {
  // Internal implementation detail.
  deleteSysOperationRecord: (data: { ID: number }) =>
    request<void>('/sysOperationRecord/deleteSysOperationRecord', { method: 'DELETE', body: data }),
  // Internal implementation detail.
  deleteSysOperationRecordByIds: (data: { ids: number[] }) =>
    request<void>('/sysOperationRecord/deleteSysOperationRecordByIds', {
      method: 'DELETE',
      body: data,
    }),
  // Internal implementation detail.
  async getSysOperationRecordList(data: PageInfo): Promise<PageResult<SysOperationRecord>> {
    const res = await request<PageResult<SysOperationRecord>>(
      '/sysOperationRecord/getSysOperationRecordList',
      { method: 'POST', body: data },
    );
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
};

// ========== sysLoginLog.js ==========
export const sysLoginLogApi = {
  // Internal implementation detail.
  deleteLoginLog: (data: { ID: number }) =>
    request<void>('/sysLoginLog/deleteLoginLog', { method: 'DELETE', body: data }),
  // Internal implementation detail.
  deleteLoginLogByIds: (data: { ids: number[] }) =>
    request<void>('/sysLoginLog/deleteLoginLogByIds', { method: 'DELETE', body: data }),
  // Internal implementation detail.
  async getLoginLogList(data: PageInfo): Promise<PageResult<SysLoginLog>> {
    const res = await request<PageResult<SysLoginLog>>('/sysLoginLog/getLoginLogList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  async findLoginLog(params: { ID: number }): Promise<SysLoginLog> {
    const res = await request<unknown>('/sysLoginLog/findLoginLog', {
      method: 'GET',
      params: { id: params.ID },
    });
    return withID(unwrapByKey<SysLoginLog>(res, ['reloginLog']));
  },
};

// ========== sysParams.js ==========
export const sysParamsApi = {
  /** createparameter */
  createSysParams: (data: Partial<SysParams>) =>
    request<void>('/sysParams/createSysParams', { method: 'POST', body: data }),
  // Internal implementation detail.
  deleteSysParams: (id: number) =>
    request<void>('/sysParams/deleteSysParams', { method: 'DELETE', params: { ID: id } }),
  // Internal implementation detail.
  deleteSysParamsByIds: (ids: number[]) =>
    request<void>('/sysParams/deleteSysParamsByIds', {
      method: 'DELETE',
      params: { 'IDs[]': ids },
    }),
  /** updateparameter */
  updateSysParams: (data: Partial<SysParams>) =>
    request<void>('/sysParams/updateSysParams', { method: 'PUT', body: data }),
  // Internal implementation detail.
  async findSysParams(params: { ID: number }): Promise<{ resysParams: SysParams }> {
    const res = await request<unknown>('/sysParams/findSysParams', { method: 'GET', params });
    return { resysParams: withID(unwrapByKey<SysParams>(res, ['resysParams'])) };
  },
  // Internal implementation detail.
  async getSysParamsList(params: PageInfo): Promise<PageResult<SysParams>> {
    const res = await request<PageResult<SysParams>>('/sysParams/getSysParamsList', {
      method: 'GET',
      params,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  getSysParam: (key: string) =>
    request<{ value: string }>('/sysParams/getSysParam', { method: 'GET', params: { key } }),
};

// ==================================================================================
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// ==================================================================================

// Internal implementation detail.
function unwrapByKey<T extends object>(res: unknown, keys: string[]): T {
  if (res !== null && typeof res === 'object' && !Array.isArray(res)) {
    const raw = res as Record<string, unknown>;
    for (const key of keys) {
      const value = raw[key];
      if (value !== null && typeof value === 'object') return value as T;
    }
  }
  return (res ?? {}) as T;
}

// Internal implementation detail.
function normalizeApiTokenRow(row: SysApiToken): SysApiToken {
  const raw = row as unknown as Record<string, unknown>;
  const base = withID(row);
  const authorityId = raw.authorityID !== undefined ? Number(raw.authorityID) : base.authorityId;
  return { ...base, authorityId };
}

// Internal implementation detail.
function extractChunkNumbers(res: unknown): number[] {
  if (res === null || res === undefined) return [];
  if (Array.isArray(res)) {
    return res
      .map((item) => {
        if (typeof item === 'number') return item;
        if (item !== null && typeof item === 'object') {
          const raw = item as Record<string, unknown>;
          const n = Number(raw.fileChunkNumber ?? raw.FileChunkNumber ?? raw.chunkNumber);
          return Number.isFinite(n) ? n : Number.NaN;
        }
        return Number.NaN;
      })
      .filter((n) => Number.isFinite(n));
  }
  if (typeof res === 'object') {
    const raw = res as Record<string, unknown>;
    if (raw.file !== null && typeof raw.file === 'object') {
      const file = raw.file as Record<string, unknown>;
      const chunks = file.ExaFileChunk ?? file.exaFileChunk ?? file.fileChunk;
      if (Array.isArray(chunks)) return extractChunkNumbers(chunks);
    }
    if (Array.isArray(raw.chunks)) return extractChunkNumbers(raw.chunks);
    if (Array.isArray(raw.list)) return extractChunkNumbers(raw.list);
  }
  return [];
}

// Internal implementation detail.
export const systemApi = {
  // Internal implementation detail.
  getSystemConfig: () => request<{ config: string }>('/system/getSystemConfig', { method: 'POST' }),
  // Internal implementation detail.
  setSystemConfig: (data: { config: string }) =>
    request<void>('/system/setSystemConfig', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getServerInfo(): Promise<ServerInfo> {
    const result = await request<unknown>('/system/getServerInfo', {
      method: 'POST',
      skipError: true,
    });
    return normalizeServerInfo(result);
  },
  // Internal implementation detail.
  reloadSystem: () => request<void>('/system/reloadSystem', { method: 'POST' }),
};

// Internal implementation detail.
export const sysErrorApi = {
  // Internal implementation detail.
  createSysError: (data: SysErrorReport) =>
    request<void>('/sysError/createSysError', { method: 'POST', body: data, skipError: true }),
  // Internal implementation detail.
  async getSysErrorList(params: PageInfo): Promise<PageResult<SysError>> {
    const res = await request<PageResult<SysError>>('/sysError/getSysErrorList', {
      method: 'GET',
      params,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  async findSysError(params: { ID: number }): Promise<SysError> {
    const res = await request<unknown>('/sysError/findSysError', { method: 'GET', params });
    return withID(unwrapByKey<SysError>(res, ['resysError', 'sysError', 'reSysError']));
  },
  // Internal implementation detail.
  updateSysError: (data: Partial<SysError>) =>
    request<void>('/sysError/updateSysError', { method: 'PUT', body: data }),
  /** deleteerror（DELETE + query params） */
  deleteSysError: (ID: number) =>
    request<void>('/sysError/deleteSysError', { method: 'DELETE', params: { ID } }),
  // Internal implementation detail.
  deleteSysErrorByIds: (ids: number[]) =>
    request<void>('/sysError/deleteSysErrorByIds', { method: 'DELETE', body: { ids } }),
  // Internal implementation detail.
  async getSysErrorSolution(params: { ID: number }): Promise<string> {
    const res = await request<{ solution?: string } | string>('/sysError/getSysErrorSolution', {
      method: 'GET',
      params,
    });
    return typeof res === 'string' ? res : (res?.solution ?? '');
  },
};

// Internal implementation detail.
export const announcementApi = {
  // Internal implementation detail.
  createInfo: (data: Pick<Info, 'title' | 'content' | 'userID' | 'attachments'>) =>
    request<void>('/info/createInfo', { method: 'POST', body: data }),
  // Internal implementation detail.
  updateInfo: (data: Pick<Info, 'ID' | 'title' | 'content' | 'userID' | 'attachments'>) =>
    request<void>('/info/updateInfo', { method: 'PUT', body: data }),
  // Internal implementation detail.
  deleteInfo: (ID: number) =>
    request<void>('/info/deleteInfo', { method: 'DELETE', params: { ID } }),
  // Internal implementation detail.
  deleteInfoByIds: (ids: number[]) =>
    request<void>('/info/deleteInfoByIds', { method: 'DELETE', body: { ids } }),
  // Internal implementation detail.
  async findInfo(params: { ID: number }): Promise<Info> {
    const res = await request<unknown>('/info/findInfo', { method: 'GET', params });
    return withID(unwrapByKey<Info>(res, ['reinfo', 'info', 'reinInfo']));
  },
  // Internal implementation detail.
  async getInfoList(params: PageInfo): Promise<PageResult<Info>> {
    const res = await request<PageResult<Info>>('/info/getInfoList', { method: 'GET', params });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  async getInfoPublic(): Promise<Info[]> {
    const res = await request<PageResult<Info> | Info[]>('/info/getInfoPublic', {
      method: 'GET',
      skipError: true,
    });
    if (Array.isArray(res)) return res.map((item) => withID(item));
    return (res?.list ?? []).map((item) => withID(item));
  },
  // Internal implementation detail.
  getInfoDataSource: () => request<InfoDataSource>('/info/getInfoDataSource', { method: 'GET' }),
};

// Internal implementation detail.
export const emailApi = {
  // Internal implementation detail.
  emailTest: () => request<void>('/email/emailTest', { method: 'POST' }),
  // Internal implementation detail.
  sendEmail: (data: { to: string; subject: string; body: string }) =>
    request<void>('/email/sendEmail', { method: 'POST', body: data }),
};

// ========== sysApiToken.js（M2：API token） ==========
export const sysApiTokenApi = {
  // Internal implementation detail.
  createApiToken: (data: { userId: number; authorityId: number; days: number; remark?: string }) =>
    request<{ token: string }>('/sysApiToken/createApiToken', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getApiTokenList(data: PageInfo): Promise<PageResult<SysApiToken>> {
    const res = await request<PageResult<SysApiToken>>('/sysApiToken/getApiTokenList', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map(normalizeApiTokenRow) };
  },
  // Internal implementation detail.
  deleteApiToken: (data: { ID: number }) =>
    request<void>('/sysApiToken/deleteApiToken', { method: 'POST', body: data }),
};


// ========== exportTemplate.js（M3：export template） ==========
export const sysExportTemplateApi = {
  /** createexport template */
  createSysExportTemplate: (data: Partial<SysExportTemplate>) =>
    request<void>('/sysExportTemplate/createSysExportTemplate', { method: 'POST', body: data }),
  /** deleteexport template（DELETE + query params） */
  deleteSysExportTemplate: (ID: number) =>
    request<void>('/sysExportTemplate/deleteSysExportTemplate', {
      method: 'DELETE',
      params: { ID },
    }),
  // Internal implementation detail.
  deleteSysExportTemplateByIds: (ids: number[]) =>
    request<void>('/sysExportTemplate/deleteSysExportTemplateByIds', {
      method: 'DELETE',
      body: { ids },
    }),
  /** updateexport template */
  updateSysExportTemplate: (data: Partial<SysExportTemplate>) =>
    request<void>('/sysExportTemplate/updateSysExportTemplate', { method: 'PUT', body: data }),
  // Internal implementation detail.
  async findSysExportTemplate(params: { ID: number }): Promise<SysExportTemplate> {
    const res = await request<unknown>('/sysExportTemplate/findSysExportTemplate', {
      method: 'GET',
      params,
    });
    return withID(
      unwrapByKey<SysExportTemplate>(res, [
        'resysExportTemplate',
        'sysExportTemplate',
        'reSysExportTemplate',
      ]),
    );
  },
  // Internal implementation detail.
  async getSysExportTemplateList(params: PageInfo): Promise<PageResult<SysExportTemplate>> {
    const res = await request<PageResult<SysExportTemplate>>(
      '/sysExportTemplate/getSysExportTemplateList',
      { method: 'GET', params },
    );
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  exportExcel: (params: { templateID: number | string }) =>
    request<{ url: string }>('/sysExportTemplate/exportExcel', { method: 'GET', params }),
  /** downloadexport template（return {url}） */
  exportTemplate: (params: { templateID: number | string }) =>
    request<{ url: string }>('/sysExportTemplate/exportTemplate', { method: 'GET', params }),
  // Internal implementation detail.
  previewSQL: (params: { templateID: number | string; params?: string }) =>
    request<{ sql: string }>('/sysExportTemplate/previewSQL', { method: 'GET', params }),
  /** import Excel（multipart：file + templateID） */
  importExcel: (file: File, templateID: number | string) => {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('templateID', String(templateID));
    return postForm<void>('/sysExportTemplate/importExcel', form);
  },
  // Internal implementation detail.
  exportExcelByToken: (token: string) =>
    downloadByUrl('/sysExportTemplate/exportExcelByToken', { params: { token } }),
  // Internal implementation detail.
  exportTemplateByToken: (token: string) =>
    downloadByUrl('/sysExportTemplate/exportTemplateByToken', { params: { token } }),
};

// ========== version.js（M3：versionmanagement） ==========
export const sysVersionApi = {
  // Internal implementation detail.
  exportVersion: (data: ExportVersionPayload) =>
    request<void>('/sysVersion/exportVersion', { method: 'POST', body: data }),
  // Internal implementation detail.
  importVersion: (data: Record<string, unknown>) =>
    request<VersionImportResult>('/sysVersion/importVersion', { method: 'POST', body: data }),
  // Internal implementation detail.
  async findSysVersion(params: { ID: number }): Promise<SysVersion> {
    const res = await request<unknown>('/sysVersion/findSysVersion', { method: 'GET', params });
    return withID(unwrapByKey<SysVersion>(res, ['resysVersion', 'sysVersion', 'reSysVersion']));
  },
  // Internal implementation detail.
  async getSysVersionList(params: PageInfo): Promise<PageResult<SysVersion>> {
    const res = await request<PageResult<SysVersion>>('/sysVersion/getSysVersionList', {
      method: 'GET',
      params,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  downloadVersionJson: (params: { ID: number }, filename?: string) =>
    downloadByUrl('/sysVersion/downloadVersionJson', { params, filename }),
  /** deleteversion（DELETE + query params） */
  deleteSysVersion: (ID: number) =>
    request<void>('/sysVersion/deleteSysVersion', { method: 'DELETE', params: { ID } }),
  // Internal implementation detail.
  deleteSysVersionByIds: (ids: number[]) =>
    request<void>('/sysVersion/deleteSysVersionByIds', { method: 'DELETE', body: { ids } }),
};

// ==================================================================================
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// ==================================================================================

// ==================================================================================
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// ==================================================================================

// Internal implementation detail.
export interface PluginRow {
  pluginName: string;
  pluginType: string;
}

// Internal implementation detail.
export interface PluginInstallSide {
  code: number;
  msg: string;
}

// Internal implementation detail.
export interface AiWorkflowMessage {
  id: string;
  role: string;
  content: string;
  snapshot?: Record<string, unknown> | null;
  conversationId?: string;
  messageId?: string;
  createdAt?: string;
  status?: 'pending' | 'complete' | 'stopped' | 'failed';
  error?: string;
}

// Internal implementation detail.
export interface AiWorkflowSessionRow {
  id: number;
  createdAt?: string;
  updatedAt?: string;
  // Internal implementation detail.
  tab?: string;
  title?: string;
  summary?: string;
  conversationId?: string;
  currentNodeId?: string;
}

// Internal implementation detail.
export interface AiWorkflowSessionDetail extends AiWorkflowSessionRow {
  messageId?: string;
  userId?: number;
  settings?: string;
  formData?: string;
  resultData?: string;
  messages?: string;
}

// Internal implementation detail.
export interface AiWorkflowSessionPayload {
  expectedUpdatedAt?: string;
  id?: number;
  tab: string;
  title?: string;
  summary?: string;
  conversationId?: string;
  messageId?: string;
  currentNodeId?: string;
  settings?: Record<string, unknown>;
  formData?: Record<string, unknown>;
  resultData?: Record<string, unknown>;
  messages: AiWorkflowMessage[];
}

/** AI workflow SSE retains conversation metadata and propagates abort/error states. */
async function streamLlmAutoSSE(
  body: Record<string, unknown>,
  onProgress: (value: LlmProgress) => void,
  signal?: AbortSignal,
): Promise<LlmProgress> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const scope = session.capture();
  Object.assign(headers, sessionHeaders(scope));
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    10 * 60 * 1000,
  );
  try {
    const response = await fetch('/api/autoCode/llmAutoSSE', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    await checkSessionResponse(response, true, scope);
    return await readLlmResponse(
      response,
      (value) => {
        assertSession(scope);
        onProgress(value);
      },
      controller.signal,
    );
  } catch (error) {
    if (timedOut) throw new Error('AI 请求超时，内容已保留，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

// Internal implementation detail.
function autoCodePayload(data: AutoCodeForm) {
  // Internal implementation detail.
  const { gvaModel: legacyModel, ...current } = data as AutoCodeForm & { gvaModel?: boolean };
  return {
    ...current,
    geaModel: data.geaModel ?? legacyModel ?? true,
    generateWeb: data.generateWeb ?? true,
    generateServer: data.generateServer ?? true,
    fields: data.fields.map((field) => ({
      ...field,
      sort: field.digitSort,
      excel: field.excel ?? data.hasExcel,
      table: field.table ?? field.digitList,
      form: field.form ?? true,
      desc: field.desc ?? true,
    })),
  };
}

export const autoCodeApi = {
  /** Normalize wrapped or bare metadata lists to the editor's string arrays. */
  async getDB(): Promise<string[]> {
    const res = await request<{ dbs?: (string | { database: string })[] } | string[]>(
      '/autoCode/getDB',
      { method: 'GET' },
    );
    const rows = Array.isArray(res) ? res : (res?.dbs ?? []);
    return rows.map((row) => (typeof row === 'string' ? row : row.database)).filter(Boolean);
  },
  async getTables(params: { dbName: string }): Promise<string[]> {
    const res = await request<{ tables?: (string | { tableName: string })[] } | string[]>(
      '/autoCode/getTables',
      { method: 'GET', params },
    );
    const rows = Array.isArray(res) ? res : (res?.tables ?? []);
    return rows.map((row) => (typeof row === 'string' ? row : row.tableName)).filter(Boolean);
  },
  async getColumn(params: { dbName: string; tableName: string }): Promise<AutoCodeColumn[]> {
    type Column = AutoCodeColumn & { dataType?: string };
    const res = await request<{ columns?: Column[] } | Column[]>('/autoCode/getColumn', {
      method: 'GET',
      params,
    });
    const rows = Array.isArray(res) ? res : (res?.columns ?? []);
    return rows.map((row) => ({ ...row, columnType: row.columnType || row.dataType || '' }));
  },
  async preview(data: AutoCodeForm): Promise<Record<string, string>> {
    const res = await request<Record<string, unknown>>('/autoCode/preview', {
      method: 'POST',
      body: autoCodePayload(data),
    });
    const files = res?.autoCode ?? res?.map ?? res ?? {};
    if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
    return Object.fromEntries(
      Object.entries(files).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  },
  /** Basic templates are a ZIP response and must use the binary download path. */
  createTemp: (data: AutoCodeForm) =>
    data.onlyTemplate
      ? downloadZipByPost(
          '/autoCode/createTemp',
          autoCodePayload(data),
          `${data.structName || 'template'}.zip`,
        )
      : request<void>('/autoCode/createTemp', { method: 'POST', body: autoCodePayload(data) }),
  // Internal implementation detail.
  addFunc: (data: {
    packageName: string;
    structName: string;
    funcName: string;
    funcDesc: string;
    router: string;
    method: string;
  }) => request<void>('/autoCode/addFunc', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getPackage(): Promise<SysPackage[]> {
    type Package = SysPackage & { desc?: string };
    const res = await request<{ packages?: Package[]; pkgs?: Package[] } | Package[]>(
      '/autoCode/getPackage',
      { method: 'POST' },
    );
    const list = Array.isArray(res) ? res : (res?.pkgs ?? res?.packages ?? []);
    return list.map((item) =>
      withID({ ...item, packageDesc: item.packageDesc || item.desc || '' }),
    );
  },
  // Internal implementation detail.
  delPackage: (data: { ID: number }) =>
    request<void>('/autoCode/delPackage', { method: 'POST', body: data }),
  // Internal implementation detail.
  createPackage: (data: { packageName: string; packageDesc: string }) =>
    request<void>('/autoCode/createPackage', {
      method: 'POST',
      body: { ...data, desc: data.packageDesc },
    }),
  // Internal implementation detail.
  getTemplates: () => request<string[]>('/autoCode/getTemplates', { method: 'GET' }),
  // Internal implementation detail.
  getMeta: (data: { ID: number }) =>
    request<unknown>('/autoCode/getMeta', { method: 'POST', body: data }),
  // Internal implementation detail.
  rollback: (data: { ID: number; deleteApi: boolean; deleteMenu: boolean; deleteTable: boolean }) =>
    request<void>('/autoCode/rollback', { method: 'POST', body: data }),
  // Internal implementation detail.
  delSysHistory: (data: { ID: number }) =>
    request<void>('/autoCode/delSysHistory', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getSysHistory(data: PageInfo): Promise<PageResult<SysHistory>> {
    const res = await request<PageResult<SysHistory>>('/autoCode/getSysHistory', {
      method: 'POST',
      body: data,
    });
    return { ...res, list: (res.list ?? []).map((item) => withID(item)) };
  },
  // Internal implementation detail.
  // Internal implementation detail.
  pubPlug: (data: { pluginName: string }) =>
    downloadZipByPost('/autoCode/pubPlug', data, `${data.pluginName}.zip`),
  // Internal implementation detail.
  installPlugin: (file: File) => {
    const form = new FormData();
    form.append('plug', file, file.name);
    return postForm<PluginInstallSide[]>('/autoCode/installPlugin', form);
  },
  // Internal implementation detail.
  removePlugin: (data: { pluginName: string }) =>
    request<void>('/autoCode/removePlugin', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getPluginList(): Promise<PluginRow[]> {
    const res = await request<{ plugins?: PluginRow[] } | PluginRow[]>('/autoCode/getPluginList', {
      method: 'GET',
    });
    return Array.isArray(res) ? res : (res?.plugins ?? []);
  },
  // Internal implementation detail.
  // Internal implementation detail.
  llmAuto: (data: Record<string, unknown>) =>
    request<unknown>('/autoCode/llmAuto', { method: 'POST', body: data }),
  // Internal implementation detail.
  llmAutoSSE: (
    data: Record<string, unknown>,
    onProgress: (value: LlmProgress) => void,
    signal?: AbortSignal,
  ) => streamLlmAutoSSE(data, onProgress, signal),
  // Internal implementation detail.
  // Internal implementation detail.
  async saveAIWorkflowSession(data: AiWorkflowSessionPayload): Promise<AiWorkflowSessionDetail> {
    const res = await request<{ session?: AiWorkflowSessionDetail } | AiWorkflowSessionDetail>(
      '/autoCode/saveAIWorkflowSession',
      {
        method: 'POST',
        body: data,
      },
    );
    if (res !== null && typeof res === 'object' && 'session' in res && res.session)
      return res.session;
    return (res ?? { id: 0, tab: data.tab, s: '[]' }) as AiWorkflowSessionDetail;
  },
  // Internal implementation detail.
  async getAIWorkflowSessionList(
    data: PageInfo & { tab?: string },
  ): Promise<PageResult<AiWorkflowSessionRow>> {
    const res = await request<PageResult<AiWorkflowSessionRow>>(
      '/autoCode/getAIWorkflowSessionList',
      { method: 'POST', body: data },
    );
    return { ...res, list: res.list ?? [] };
  },
  // Internal implementation detail.
  async getAIWorkflowSessionDetail(data: { ID: number }): Promise<AiWorkflowSessionDetail> {
    const res = await request<{ session?: AiWorkflowSessionDetail } | AiWorkflowSessionDetail>(
      '/autoCode/getAIWorkflowSessionDetail',
      {
        method: 'POST',
        body: { id: data.ID }, // backend json tag documentation id（Echo binding documentation，documentation）
      },
    );
    if (res !== null && typeof res === 'object' && 'session' in res && res.session)
      return res.session;
    return (res ?? { id: data.ID, s: '[]' }) as AiWorkflowSessionDetail;
  },
  // Internal implementation detail.
  deleteAIWorkflowSession: (data: { ID: number }) =>
    request<void>('/autoCode/deleteAIWorkflowSession', { method: 'POST', body: { id: data.ID } }),
  // Internal implementation detail.
  dumpAIWorkflowMarkdown: (data: { ID: number }) =>
    downloadZipByPost('/autoCode/dumpAIWorkflowMarkdown', { id: data.ID }),
};

// ========== jwt.js ==========
export const jwtApi = {
  // Internal implementation detail.
  jsonInBlacklist: () => request<void>('/jwt/jsonInBlacklist', { method: 'POST' }),
};

// ==================================================================================
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// ==================================================================================

// Internal implementation detail.
export interface SysSkill {
  id?: number;
  name: string;
  description: string;
  version: string;
  category: string;
  status: number;
}

// Internal implementation detail.
export interface SkillDetail {
  name: string;
  description: string;
  version: string;
  category: string;
  status: number;
  markdown: string;
  scripts: Record<string, string>;
  resources: Record<string, string>;
  references: Record<string, string>;
  templates: Record<string, string>;
}

// Internal implementation detail.
export interface SkillTool {
  key: string;
  label: string;
}

// Internal implementation detail.
function unwrapSkillFileDraft(res: unknown): { fileName: string; content: string } {
  if (res !== null && typeof res === 'object') {
    const raw = res as { fileName?: unknown; content?: unknown };
    return { fileName: String(raw.fileName ?? ''), content: String(raw.content ?? '') };
  }
  return { fileName: '', content: '' };
}

// Internal implementation detail.
async function downloadZipByPost(path: string, body: unknown, filename?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const scope = session.capture();
  Object.assign(headers, sessionHeaders(scope));

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    toastError('网络请求失败，请检查网络连接');
    throw new ApiError(-1, '网络请求失败，请检查网络连接');
  }
  await checkSessionResponse(response, true, scope);
  await saveDownloadResponse(response, filename, 'download', scope);
}

// Internal implementation detail.
export const skillsApi = {
  // Internal implementation detail.
  async getTools(): Promise<SkillTool[]> {
    const res = await request<{ tools?: SkillTool[] } | SkillTool[]>('/skills/getTools', {
      method: 'GET',
    });
    return Array.isArray(res) ? res : (res?.tools ?? []);
  },
  // Internal implementation detail.
  async getSkillList(data: { keyword?: string; category?: string } = {}): Promise<SysSkill[]> {
    const res = await request<{ skills?: SysSkill[] } | SysSkill[]>('/skills/getSkillList', {
      method: 'POST',
      body: data,
    });
    return Array.isArray(res) ? res : (res?.skills ?? []);
  },
  // Internal implementation detail.
  async getSkillDetail(data: { name: string }): Promise<SkillDetail> {
    const res = await request<{ detail?: SkillDetail } | SkillDetail>('/skills/getSkillDetail', {
      method: 'POST',
      body: data,
    });
    if (
      res !== null &&
      typeof res === 'object' &&
      'detail' in res &&
      res.detail !== null &&
      typeof res.detail === 'object'
    ) {
      return res.detail;
    }
    return (res ?? {
      name: data.name,
      description: '',
      version: '',
      category: '',
      status: 1,
      markdown: '',
      scripts: {},
      resources: {},
      references: {},
      templates: {},
    }) as SkillDetail;
  },
  // Internal implementation detail.
  saveSkill: (data: {
    name: string;
    description: string;
    version: string;
    category: string;
    status: number;
    markdown: string;
  }) => request<void>('/skills/saveSkill', { method: 'POST', body: data }),
  // Internal implementation detail.
  deleteSkill: (data: { name: string }) =>
    request<void>('/skills/deleteSkill', { method: 'POST', body: data }),
  // Internal implementation detail.
  async createScript(data: {
    name: string;
    fileName: string;
    scriptType: string;
  }): Promise<{ fileName: string; content: string }> {
    const res = await request<unknown>('/skills/createScript', { method: 'POST', body: data });
    return unwrapSkillFileDraft(res);
  },
  // Internal implementation detail.
  async getScript(data: { name: string; fileName: string }): Promise<string> {
    const res = await request<{ content?: string } | string>('/skills/getScript', {
      method: 'POST',
      body: data,
    });
    return typeof res === 'string' ? res : (res?.content ?? '');
  },
  // Internal implementation detail.
  saveScript: (data: { name: string; fileName: string; content: string }) =>
    request<void>('/skills/saveScript', { method: 'POST', body: data }),
  // Internal implementation detail.
  async createResource(data: {
    name: string;
    fileName: string;
  }): Promise<{ fileName: string; content: string }> {
    const res = await request<unknown>('/skills/createResource', { method: 'POST', body: data });
    return unwrapSkillFileDraft(res);
  },
  // Internal implementation detail.
  async getResource(data: { name: string; fileName: string }): Promise<string> {
    const res = await request<{ content?: string } | string>('/skills/getResource', {
      method: 'POST',
      body: data,
    });
    return typeof res === 'string' ? res : (res?.content ?? '');
  },
  // Internal implementation detail.
  saveResource: (data: { name: string; fileName: string; content: string }) =>
    request<void>('/skills/saveResource', { method: 'POST', body: data }),
  // Internal implementation detail.
  async createReference(data: {
    name: string;
    fileName: string;
  }): Promise<{ fileName: string; content: string }> {
    const res = await request<unknown>('/skills/createReference', { method: 'POST', body: data });
    return unwrapSkillFileDraft(res);
  },
  // Internal implementation detail.
  async getReference(data: { name: string; fileName: string }): Promise<string> {
    const res = await request<{ content?: string } | string>('/skills/getReference', {
      method: 'POST',
      body: data,
    });
    return typeof res === 'string' ? res : (res?.content ?? '');
  },
  // Internal implementation detail.
  saveReference: (data: { name: string; fileName: string; content: string }) =>
    request<void>('/skills/saveReference', { method: 'POST', body: data }),
  // Internal implementation detail.
  async createTemplate(data: {
    name: string;
    fileName: string;
  }): Promise<{ fileName: string; content: string }> {
    const res = await request<unknown>('/skills/createTemplate', { method: 'POST', body: data });
    return unwrapSkillFileDraft(res);
  },
  // Internal implementation detail.
  async getTemplate(data: { name: string; fileName: string }): Promise<string> {
    const res = await request<{ content?: string } | string>('/skills/getTemplate', {
      method: 'POST',
      body: data,
    });
    return typeof res === 'string' ? res : (res?.content ?? '');
  },
  /** savetemplatefile */
  saveTemplate: (data: { name: string; fileName: string; content: string }) =>
    request<void>('/skills/saveTemplate', { method: 'POST', body: data }),
  // Internal implementation detail.
  async getGlobalConstraint(): Promise<{ content: string; exists: boolean }> {
    const res = await request<{ content?: string; exists?: boolean }>(
      '/skills/getGlobalConstraint',
      { method: 'POST' },
    );
    return { content: res?.content ?? '', exists: res?.exists === true };
  },
  // Internal implementation detail.
  saveGlobalConstraint: (data: { content: string }) =>
    request<void>('/skills/saveGlobalConstraint', { method: 'POST', body: data }),
  // Internal implementation detail.
  packageSkill: (data: { name: string }) =>
    downloadZipByPost('/skills/packageSkill', data, `${data.name}.zip`),
  // Internal implementation detail.
  downloadOnlineSkill: (url: string) =>
    request<void>('/skills/downloadOnlineSkill', { method: 'GET', params: { url } }),
};

// Internal implementation detail.
export type { MenuBtn };
