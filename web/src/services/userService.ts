// Internal implementation detail.
import { userApi } from '../api/endpoints';
import type { PageInfo, PageResult } from '../types';
import type { ChangePasswordPayload, LoginPayload, LoginResult, RegisterPayload, SysUser } from '../domain/user';

export const userService = {
  login: (payload: LoginPayload) => userApi.login(payload),
  register: (payload: RegisterPayload) => userApi.register(payload),
  getUserInfo: () => userApi.getUserInfo(),
  changePassword: (payload: ChangePasswordPayload) => userApi.changePassword(payload),
  resetPassword: (ID: number, password: string) => userApi.resetPassword({ ID, password }),
  page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysUser>> =>
    userApi.getUserList({ page: 1, pageSize: 10, ...params }),
  remove: (ID: number) => userApi.deleteUser({ ID }),
  update: (user: Partial<SysUser>) => userApi.setUserInfo(user),
  updateSelf: (user: Partial<SysUser>) => userApi.setSelfInfo(user),
  setAuthorities: (ID: number, authorityIds: number[]) => userApi.setUserAuthorities({ ID, authorityIds }),
};
