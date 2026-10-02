import { Alert } from 'antd';
export function formatTime(value?: string | number | Date) { if (!value) return '-'; return new Date(value).toLocaleString(); }
export function LoadError({ error, retry }: { error: string; retry?: () => void }) { return <Alert type="error" message={error} showIcon action={retry ? <a onClick={retry}>重试</a> : undefined} />; }
