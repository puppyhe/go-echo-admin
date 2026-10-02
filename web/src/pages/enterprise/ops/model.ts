import type { Definition } from './api';

export interface EditorValues extends Omit<Definition, 'parameters' | 'http'> {
  parametersJSON: string;
  url?: string;
  httpMethod?: string;
  headersJSON?: string;
}
export function jsonObject(raw: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw || '{}');
  } catch {
    throw new Error(`${label}JSON解析错误`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error(`${label}JSON对象格式错误`);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 45000)
    throw new Error(`${label}JSON超出45KB限制`);
  return value as Record<string, unknown>;
}
export function editorValues(def: Definition): EditorValues {
  return {
    name: def.name,
    group: def.group,
    executor: def.executor,
    methodKey: def.methodKey,
    cron: def.cron,
    timezone: def.timezone,
    timeoutSeconds: def.timeoutSeconds,
    parametersJSON: JSON.stringify(def.parameters ?? {}, null, 2),
    url: def.http?.url ?? '',
    httpMethod: def.http?.method || 'GET',
    headersJSON: JSON.stringify(def.http?.headers ?? {}, null, 2),
  };
}
export function taskDefinition(values: EditorValues): Definition {
  const parts = values.cron.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) throw new Error('Cron表达式格式错误');
  const parameters = jsonObject(values.parametersJSON, '任务参数');
  const http = { url: '', method: '', headers: {} as Record<string, string> };
  if (values.executor === 'http') {
    const headers = jsonObject(values.headersJSON ?? '{}', '请求头');
    if (Object.values(headers).some((value) => typeof value !== 'string'))
      throw new Error('请求头格式错误');
    http.url = values.url?.trim() ?? '';
    http.method = values.httpMethod || 'GET';
    http.headers = headers as Record<string, string>;
    if (['GET', 'HEAD'].includes(http.method) && Object.keys(parameters).length)
      throw new Error('GET/HEAD请求参数应放在查询参数中');
  }
  return {
    name: values.name.trim(),
    group: values.group?.trim() ?? '',
    executor: values.executor,
    methodKey: values.executor === 'method' ? values.methodKey : '',
    http,
    parameters,
    cron: values.cron.trim(),
    timezone: values.timezone,
    timeoutSeconds: values.timeoutSeconds,
  };
}
export const defaultDefinition: Definition = {
  name: '',
  group: '',
  executor: 'method',
  methodKey: 'system.heartbeat',
  http: { url: '', method: 'GET', headers: {} },
  parameters: {},
  cron: '*/5 * * * *',
  timezone: 'Asia/Shanghai',
  timeoutSeconds: 30,
};
export const statusLabels: Record<string, string> = {
  queued: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  timeout: '超时',
  interrupted: '中断',
};
export function running(status?: string) {
  return status === 'queued' || status === 'running';
}
