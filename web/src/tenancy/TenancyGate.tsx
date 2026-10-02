import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import { session } from '../api/request';
import { tenancyApi } from './api';
import { tenancyFeedback, type TenancyFeedback } from './errors';
import { zh } from '../locale/zh';
export function TenancyGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>();
  const [error, setError] = useState<TenancyFeedback>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(undefined);
    void (async () => {
      // Login and initialization own their public tenant resolution. Keeping
      // those pages outside the gate lets them render the tenant code form
      // while an anonymous user selects a tenant.
      if (['/login', '/init'].includes(window.location.pathname)) {
        setEnabled(true);
        return;
      }
      const info = await tenancyApi.info();
      if (!active) return;
      const linked = new URLSearchParams(window.location.search).get('tenant');
      if (!info.enabled) {
        session.clear();
        setError({ kind: 'disabled', title: '租户服务不可用', description: '服务器已禁用租户管理。' });
        return;
      }
      const code = linked || session.getTenant()?.code;
      if (code) {
        const tenant = await tenancyApi.resolve(code);
        if (!active) return;
        session.selectTenant(tenant);
      } else if (session.isAuthenticated()) session.clear();
      if (active) setEnabled(true);
    })().catch((e) => {
      if (active) {
        session.clear();
        setError(tenancyFeedback(e));
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (error)
    return (
      <div className="page-loading">
        <Alert
          type={error.kind === 'disabled' ? 'info' : 'error'}
          showIcon
          message={error.title}
          description={error.description}
          action={
            <>
              <Button onClick={() => setAttempt((n) => n + 1)}>{zh['retry']}</Button>
              <Button
                onClick={() => {
                  session.selectTenant(null);
                  window.location.assign('/login');
                }}
              >
                {zh['returnToSignIn']}
              </Button>
            </>
          }
        />
      </div>
    );
  if (enabled === undefined)
    return (
      <div className="page-loading">
        <Space direction="vertical" align="center">
          <Spin />
          <Typography.Text type="secondary">{zh['loadingTenant']}</Typography.Text>
        </Space>
      </div>
    );
  return children;
}
