import { ApiError } from '../api/request';

export type TenancyOperation = 'info' | 'resolve';
export class TenancyApiError extends ApiError {
  constructor(
    code: number,
    message: string,
    readonly operation: TenancyOperation,
    readonly reason: 'connection' | 'response' | 'configuration' = 'response',
  ) {
    super(code, message);
    this.name = 'TenancyApiError';
  }
}

export interface TenancyFeedback {
  kind: 'connection' | 'service' | 'configuration' | 'tenant' | 'disabled';
  title: string;
  description: string;
}

// Keep the API error intact for diagnostics; public login views only use this copy.
export function tenancyFeedback(_error: unknown): TenancyFeedback {
  if (_error instanceof TenancyApiError) {
    if (_error.reason === 'connection')
      return {
        kind: 'connection',
        title: '连接失败',
        description: '请检查网络连接后重试；如果问题持续，请联系管理员。',
      };
    if (_error.reason === 'configuration')
      return {
        kind: 'configuration',
        title: '租户服务配置错误',
        description: '租户服务配置不正确，请稍后重试。',
      };
    if (
      _error.operation === 'resolve' &&
      _error.code < 500 &&
      ['enable', 'message', 'disabled'].includes(_error.message)
    )
      return {
        kind: 'tenant',
        title: '租户不可用',
        description: '租户不存在或已被禁用。',
      };
  }
  return {
    kind: 'service',
    title: '租户服务错误',
    description: '请稍后重试；如果问题持续，请联系管理员。',
  };
}
