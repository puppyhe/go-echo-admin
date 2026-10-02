// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
// Internal implementation detail.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button, Typography } from 'antd';
import { sessionHeaders, session } from '../api/request';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  // Internal implementation detail.
  label?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Internal implementation detail.
function buildReport(error: Error, info: ErrorInfo, label?: string): Record<string, string> {
  const location = new URL(window.location.href);
  location.search = '';
  location.hash = '';
  location.username = '';
  location.password = '';
  return {
    app: 'frontend',
    msg: error.message || String(error),
    err: `${error.name}: ${error.message}${label ? ` (${label})` : ''}`,
    stack: `${error.stack ?? ''}\n--- componentStack ---\n${info.componentStack ?? ''}`,
    level: 'error',
    request: location.toString(),
  };
}

// Internal implementation detail.
async function reportFrontendError(error: Error, info: ErrorInfo, label?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const scope = session.capture();
  Object.assign(headers, sessionHeaders(scope));
  try {
    await fetch('/api/sysError/createSysError', {
      method: 'POST',
      headers,
      body: JSON.stringify(buildReport(error, info, label)),
      keepalive: true,
    });
  } catch {
    // Internal implementation detail.
  }
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('frontend.render_error', error, {
      label: this.props.label,
      componentStack: info.componentStack,
    });
    // Internal implementation detail.
    void reportFrontendError(error, info, this.props.label).catch(() => undefined);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Alert
        type="error"
        showIcon
        message={`页面错误${this.props.label ? `：${this.props.label}` : ''}`}
        description={
          <>
            <Typography.Paragraph>{error.message}</Typography.Paragraph>
            <Button danger onClick={() => window.location.reload()}>
              重新加载页面
            </Button>
          </>
        }
      />
    );
  }
}
