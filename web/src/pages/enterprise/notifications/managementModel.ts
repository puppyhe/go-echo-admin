import type { NotificationCategory, NotificationChannel, TemplateVariable } from './managementApi';
export const categories: { value: NotificationCategory; label: string }[] = [
  { value: 'system', label: '系统通知' },
  { value: 'todo', label: '待办事项' },
  { value: 'announcement', label: '公告' },
  { value: 'alert', label: '告警' },
  { value: 'report', label: '报表' },
];
export const channels: { value: NotificationChannel; label: string }[] = [
  { value: 'inbox', label: '站内通知' },
  { value: 'email', label: '邮件' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'sms', label: '短信' },
];
export function validateTemplateVariables(variables: TemplateVariable[], text: string): void {
  const names = new Set<string>();
  for (const variable of variables) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(variable.name ?? '') ||
      ['constructor', 'prototype'].includes(variable.name)
    )
      throw new Error('变量名最多 50 个字符，只能使用英文、数字和下划线，且必须以英文开头');
    if (names.has(variable.name)) throw new Error(`变量 ${variable.name} 重复`);
    names.add(variable.name);
  }
  for (const match of text.matchAll(/{{([\s\S]*?)}}/g)) {
    const name = /^\s*\.([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(match[1])?.[1];
    if (!name) throw new Error('模板变量必须使用 {{.变量名}} 格式');
    if (!names.has(name)) throw new Error(`模板变量 ${name} 未定义`);
  }
  const remainder = text.replace(/{{[\s\S]*?}}/g, '');
  if (remainder.includes('{{') || remainder.includes('}}'))
    throw new Error('模板中存在未闭合的变量标记');
}
export function templateValues(
  variables: TemplateVariable[],
  values: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const variable of variables) {
    const value = values[variable.name];
    if (value === undefined || value === null || value === '') {
      if (variable.required) throw new Error(`请输入变量 ${variable.name}`);
      continue;
    }
    if (variable.type === 'number') {
      if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim()) ||
        !Number.isFinite(Number(value))
      )
        throw new Error(`${variable.name} 必须是数字`);
      result[variable.name] = Number(value);
    } else if (variable.type === 'boolean') {
      if (value !== true && value !== false) throw new Error(`${variable.name} 必须是布尔值`);
      result[variable.name] = value;
    } else {
      if (typeof value !== 'string') throw new Error(`${variable.name} 必须是文本`);
      if (utf8Length(value) > 12000) throw new Error(`${variable.name} 不能超过 12000 字节`);
      result[variable.name] = value;
    }
  }
  return result;
}
export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: value }).format();
    return Boolean(value.trim());
  } catch {
    return false;
  }
}
export const validClockTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const timezones = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
].map((value) => ({ value }));

export function quietRangeError(start: string, end: string, enabled = false): string | null {
  if (!enabled && !start && !end) return null;
  if (!validClockTime(start) || !validClockTime(end))
    return '静默开始和结束时间必须使用 HH:mm 格式';
  return start === end ? '静默开始和结束时间不能相同' : null;
}
export const utf8Length = (value: string) => new TextEncoder().encode(value).length;
export function webhookHostsError(values: string[]): string | null {
  if (values.length > 100) return '最多配置 100 个主机';
  const host =
    /^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return values.some((value) => value.length > 253 || !host.test(value.trim()))
    ? '请输入合法主机名，例如 *.example.com；不要包含协议、端口或路径'
    : null;
}
