// Internal implementation detail.
import type { SysAuthority } from './authority';
import type { TenantIdentity } from './tenancy';

// Internal implementation detail.
export interface SysUser {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  uuid: string;
  userName: string;
  nickName: string;
  headerImg: string;
  authorityId: number;
  authority: SysAuthority;
  authorities: SysAuthority[];
  authorityIds?: number[];
  phone: string;
  email: string;
  // Internal implementation detail.
  enable: number;
  originSetting?: Record<string, unknown> | null;
}

/** POST /base/login response。 */
export interface LoginResult {
  user: SysUser;
  token: string;
  expiresAt: number;
  passwordChangeRequired?: boolean;
  tenant: TenantIdentity;
  sessionKind: 'tenant';
}

/** POST /base/login request。 */
export interface LoginPayload {
  username: string;
  password: string;
  captcha: string;
  captchaId: string;
}

// Internal implementation detail.
export interface CaptchaResult {
  captchaId: string;
  picPath: string;
  captchaLength: number;
  openCaptcha: boolean;
}

/**
 * POST /user/admin_register request。
 */
export interface RegisterPayload {
  userName: string;
  passWord: string;
  nickName: string;
  headerImg: string;
  authorityId: number;
  authorityIds?: number[];
  phone?: string;
  email?: string;
  enable: number;
}

// Internal implementation detail.
export interface UserInfoResult {
  userInfo: SysUser;
}

// Internal implementation detail.
export interface ChangePasswordPayload {
  password: string;
  newPassword: string;
}
