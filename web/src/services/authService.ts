// Internal implementation detail.
import { jwtApi, userApi } from '../api/endpoints';
import { session, ApiError, assertSession } from '../api/request';
import type {
  CaptchaResult,
  LoginPayload,
  LoginResult,
  RegisterPayload,
  SysUser,
} from '../domain/user';

// Internal implementation detail.
export function getCaptcha(): Promise<CaptchaResult> {
  return userApi.captcha();
}

// Internal implementation detail.
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const scope = session.capture();
  const result = await userApi.login(payload);
  assertSession(scope);
  const tenant = session.getTenant();
  if (
    !tenant ||
    !result.tenant ||
    result.tenant.id !== tenant.id ||
    result.tenant.code !== tenant.code ||
    result.sessionKind !== 'tenant'
  )
    throw new ApiError(-1, 'The selected tenant does not match the sign-in response');
  session.start(result.token, result.user, result.tenant);
  return result;
}

// Internal implementation detail.
export function register(payload: RegisterPayload): Promise<void> {
  return userApi.register(payload);
}

// Internal implementation detail.
export async function getUserInfo(): Promise<SysUser> {
  const scope = session.capture();
  const info = await userApi.getUserInfo();
  assertSession(scope);
  session.setSnapshot(info);
  return info;
}

// Internal implementation detail.
export async function logout(): Promise<void> {
  const scope = session.capture();
  try {
    await jwtApi.jsonInBlacklist();
  } catch (error) {
    // A 401 already cleared an unusable session. Persistence/network failures
    // must remain visible instead of claiming that a live credential is gone.
    if (!(error instanceof ApiError && error.code === 401)) throw error;
  }
  if (session.isCurrent(scope)) session.clear();
}
