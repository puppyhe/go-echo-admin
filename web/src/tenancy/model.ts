export const tenantCodePattern = /^[a-z][a-z0-9-]{1,31}$/;
export function validateTenantCode(code: string): void {
  if (!tenantCodePattern.test(code) || code === 'platform')
    throw new Error('租户编码需为 2–32 位，以字母开头，只能包含字母、数字和短横线。');
}
export function validateAdminPassword(password: string): void {
  const bytes = new TextEncoder().encode(password).length;
  if ([...password].length < 12 || bytes > 72)
    throw new Error('密码需为 12–72 个字符，且 UTF-8 字节数不能超过 72。');
}
