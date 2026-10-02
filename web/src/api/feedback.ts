// Internal implementation detail.
// Internal implementation detail.
import type { MessageInstance } from 'antd/es/message/interface';

let messageApi: MessageInstance | null = null;

export function bindMessageApi(api: MessageInstance): void {
  messageApi = api;
}

// Internal implementation detail.
export function toastError(msg: string): void {
  messageApi?.error(msg);
}
