// Login, captcha refresh and password recovery share the current session contract.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, App, Button, ConfigProvider, Form, Input, Spin, Typography, theme } from 'antd';
import {
  ApartmentOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import * as authService from '../../services/authService';
import { session } from '../../api/request';
import { securityApi, type PasswordStatus } from '../systemTools/security/api';
import { PasswordRecovery } from '../systemTools/security/PasswordRecovery';
import { useAuth } from '../../auth/AuthContext';
import { useMenu } from '../../menu/MenuContext';
import type { CaptchaResult } from '../../domain/user';
import { tenancyApi } from '../../tenancy/api';
import { tenancyFeedback } from '../../tenancy/errors';
import { validateTenantCode } from '../../tenancy/model';
import { zh } from '../../locale/zh';
import { DEFAULT_PRIMARY_COLOR } from '../../layout/theme';
import './LoginPage.css';

interface Values {
  username: string;
  password: string;
  captcha?: string;
}
const sessionGeneration = () => session.capture().generation;
export default function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const menu = useMenu();
  // Internal implementation detail.
  const generation = useSyncExternalStore(session.subscribe, sessionGeneration, sessionGeneration);
  const [tenant, setTenant] = useState(session.getTenant);
  const [tenantError, setTenantError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [form] = Form.useForm<Values>();
  const [captcha, setCaptcha] = useState<CaptchaResult | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [recovery, setRecovery] = useState<PasswordStatus | null>(null);
  const active = useRef(false);
  const resolution = useRef(0);
  const captchaRequest = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      resolution.current++;
    };
  }, []);
  useEffect(() => {
    const linkedCode = new URLSearchParams(location.search).get('tenant')?.trim();
    if (!linkedCode || tenant?.code === linkedCode) return;
    const attempt = ++resolution.current;
    setResolving(true);
    setTenantError('');
    void tenancyApi
      .resolve(linkedCode)
      .then((resolved) => {
        if (!active.current || attempt !== resolution.current) return;
        session.selectTenant(resolved);
        setTenant(resolved);
      })
      .catch((error) => {
        if (active.current && attempt === resolution.current) {
          const feedback = tenancyFeedback(error);
          setTenantError(`${feedback.title}；${feedback.description}`);
        }
      })
      .finally(() => {
        if (active.current && attempt === resolution.current) setResolving(false);
      });
  }, [location.search, tenant?.code]);
  useEffect(() => {
    const scope = session.capture();
    if (session.isAuthenticated() || new URLSearchParams(window.location.search).has('passwordChange'))
      void securityApi
        .status()
        .then((status) => {
          if (active.current && session.isCurrent(scope) && status.required) setRecovery(status);
        })
        .catch(() => undefined);
  }, []);
  const exitRecovery = async () => {
    try {
      await authService.logout();
      auth.clearSession();
      setRecovery(null);
      form.resetFields();
      void refreshCaptcha();
    } catch {
      // The request layer reports the failure; retain the recovery session so
      // the user can retry server-side revocation.
    }
  };
  const refreshCaptcha = useCallback(async () => {
    const scope = session.capture();
    const attempt = ++captchaRequest.current;
    const isCurrent = () =>
      active.current && attempt === captchaRequest.current && session.isCurrent(scope);
    if (!tenant) {
      setCaptcha(null);
      setCaptchaLoading(false);
      return;
    }
    setCaptchaLoading(true);
    try {
      const result = await authService.getCaptcha();
      if (!isCurrent()) return;
      setCaptcha(result);
      form.setFieldValue('captcha', '');
    } catch {
      if (isCurrent()) setCaptcha(null);
    } finally {
      // A tenant change can advance the session generation while this public
      // request is in flight. Ignore stale data, but never leave the current
      // form's spinner stuck when this attempt is still the latest one.
      if (active.current && attempt === captchaRequest.current) setCaptchaLoading(false);
    }
  }, [form, tenant, generation]);
  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);
  const submit = async (values: Values) => {
    if (!captcha) {
      message.error(zh['captchaConfig']);
      return;
    }
    setLogging(true);
    try {
      const result = await auth.login({
        ...values,
        captcha: (values.captcha || '').replace(/\s+/g, ''),
        captchaId: captcha.captchaId,
      });
      if (result.passwordChangeRequired) {
        setRecovery(await securityApi.status());
        form.setFieldValue('password', '');
        return;
      }
      setRecovery(null);
      const [user] = await Promise.all([auth.loadSession(), menu.reload()]);
      const previous = location.state as { from?: string; tenantCode?: string } | null;
      const from =
        previous?.tenantCode === tenant?.code ? previous?.from : undefined;
      const target =
        from?.startsWith('/') && !from.startsWith('//') && !/^\/(login|init)(\/|\?|$)/.test(from)
          ? from
          : menu.resolveLandingPath(user.authority?.defaultRouter);
      message.success(zh['loginSuccess']);
      navigate(target, { replace: true });
    } catch {
      void refreshCaptcha();
    } finally {
      setLogging(false);
    }
  };
  return (
    <ConfigProvider
      theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: DEFAULT_PRIMARY_COLOR } }}
    >
      <main className="login-page">
        <section
          className={tenant ? 'login-card' : 'login-card login-card-tenant'}
          aria-labelledby="login-title"
        >
          <header className="login-card-header">
            <div className="login-card-brand">
              <img className="login-logo" src="/logo.png" alt="" aria-hidden="true" />
              <strong>Go-Echo-Admin</strong>
            </div>
          </header>
          <h1 id="login-title">{recovery ? zh['security'] : zh['welcome']}</h1>
          {!tenant ? (
            <>
              <Typography.Paragraph type="secondary">
                {zh['inputTenant']}
              </Typography.Paragraph>
              <Form
                className="tenant-form"
                layout="vertical"
                onFinish={async (values: { code: string }) => {
                  const attempt = ++resolution.current;
                  setResolving(true);
                  setTenantError('');
                  try {
                    const resolved = await tenancyApi.resolve(values.code);
                    if (!active.current || attempt !== resolution.current) return;
                    session.selectTenant(resolved);
                    setTenant(resolved);
                    navigate(`/login?tenant=${encodeURIComponent(resolved.code)}`, {
                      replace: true,
                    });
                  } catch (e) {
                    if (active.current && attempt === resolution.current) {
                      const feedback = tenancyFeedback(e);
                      setTenantError(`${feedback.title}；${feedback.description}`);
                    }
                  } finally {
                    if (active.current && attempt === resolution.current) setResolving(false);
                  }
                }}
              >
                <Form.Item
                  name="code"
                  label={zh['tenantCode']}
                  rules={[
                    { required: true, whitespace: true },
                    {
                      validator: async (_, value: string) => {
                        validateTenantCode(value || '');
                      },
                    },
                  ]}
                >
                  <Input
                    size="large"
                    prefix={<ApartmentOutlined />}
                    placeholder={zh['tenantExample']}
                    autoComplete="organization"
                  />
                </Form.Item>
                {tenantError && (
                  <Alert type="error" message={tenantError} style={{ marginBottom: 16 }} />
                )}
                <Button
                  className="tenant-submit"
                  type="primary"
                  htmlType="submit"
                  block
                  loading={resolving}
                  size="large"
                >
                  {zh['continue']}
                </Button>
              </Form>
            </>
          ) : recovery ? (
            <PasswordRecovery
              status={recovery}
              onComplete={exitRecovery}
              onCancel={() => {
                void authService.logout().finally(exitRecovery);
              }}
            />
          ) : (
            <>
              {tenant && (
                <Alert
                  type="info"
                  message={`${tenant.name} · ${tenant.code}`}
                  action={
                    <Button
                      type="link"
                      disabled={logging}
                      onClick={() => {
                        auth.clearSession();
                        session.selectTenant(null);
                        setTenant(null);
                        setRecovery(null);
                        form.resetFields();
                        navigate('/login', { replace: true });
                      }}
                    >
                      {zh['changeTenant']}
                    </Button>
                  }
                  style={{ marginBottom: 16 }}
                />
              )}
              <div className="login-mode">
                <span>{zh['passwordLogin']}</span>
              </div>
              <Form
                form={form}
                className="login-form"
                initialValues={{ username: 'admin', password: '', captcha: '' }}
                onFinish={(values) => {
                  void submit(values);
                }}
              >
                <Form.Item
                  name="username"
                  rules={[{ required: true, min: 5, message: zh['invalidUsername'] }]}
                >
                  <Input
                    size="large"
                    autoComplete="username"
                    prefix={<UserOutlined />}
                    placeholder={zh['enterUsername']}
                    aria-label={zh['username']}
                  />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: zh['enterPassword'] }]}>
                  <Input.Password
                    size="large"
                    autoComplete="current-password"
                    prefix={<LockOutlined />}
                    placeholder={zh['enterPassword']}
                    aria-label={zh['password']}
                  />
                </Form.Item>
                {captcha?.openCaptcha && (
                  <div className="login-captcha-row">
                    <Form.Item
                      name="captcha"
                      rules={[
                        {
                          validator: (_, value: string) => {
                            const clean = (value || '').replace(/\s+/g, '');
                            return /^\d+$/.test(clean) &&
                              clean.length >= (captcha.captchaLength || 0)
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(`${zh['enterCaptcha']} (${captcha.captchaLength || ''})`),
                                );
                          },
                        },
                      ]}
                    >
                      <Input
                        size="large"
                        prefix={<SafetyCertificateOutlined />}
                        placeholder={zh['enterCaptcha']}
                        autoComplete="off"
                        inputMode="numeric"
                        aria-label={zh['captcha']}
                      />
                    </Form.Item>
                    <button
                      type="button"
                      className="login-captcha-button"
                      aria-label={zh['refreshCaptcha']}
                      onClick={() => {
                        void refreshCaptcha();
                      }}
                    >
                      {captchaLoading ? (
                        <Spin size="small" />
                      ) : (
                        <img src={captcha.picPath} alt={zh['captcha']} />
                      )}
                    </button>
                  </div>
                )}
                {!captcha && !captchaLoading && (
                  <Button
                    block
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      void refreshCaptcha();
                    }}
                    style={{ marginBottom: 16 }}
                  >
                    {zh['captchaAction']}
                  </Button>
                )}
                <Form.Item>
                  <Button
                    className="login-submit"
                    block
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={logging || captchaLoading}
                    disabled={!captcha}
                  >
                    {zh['signIn']}
                  </Button>
                </Form.Item>
              </Form>
              <div className="login-actions">
                {import.meta.env.DEV && (
                  <Button
                    className="login-init"
                    type="link"
                    onClick={() => {
                      navigate('/init');
                    }}
                  >
                    {zh['deploy']} &gt;
                  </Button>
                )}
                <Button
                  className="login-forgot"
                  type="link"
                  onClick={() => message.info(zh['resetPassword'])}
                >
                  {zh['forgotPassword']}
                </Button>
              </div>
            </>
          )}
          {!recovery && (
            <Button className="login-platform-link" type="link" onClick={() => navigate('/platform/login')}>
              {zh['administratorSignIn']}
            </Button>
          )}
        </section>
      </main>
    </ConfigProvider>
  );
}
