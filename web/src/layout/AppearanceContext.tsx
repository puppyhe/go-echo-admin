import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, theme } from 'antd';
import { DEFAULT_PRIMARY_COLOR } from './theme';

// Keep Ant Design's generated styles on the same Source Han Sans stack as the
// application shell.  The CSS variable includes platform aliases and local
// fallbacks so deployments do not need an external font request.
const UI_FONT_FAMILY =
  '"Source Han Sans SC", "Source Han Sans CN", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif';

export interface Appearance {
  darkMode: 'light' | 'dark' | 'auto';
  primaryColor: string;
  sideMode: 'normal' | 'sidebar' | 'head' | 'combination';
  sideWidth: number;
  showTabs: boolean;
  watermark: boolean;
  grey: boolean;
  weakness: boolean;
  size: 'small' | 'middle' | 'large';
}
const defaults: Appearance = {
  // Keep the first visit calm and predictable; users can still opt into
  // system-following or dark mode from the appearance drawer.
  darkMode: 'light',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  sideMode: 'normal',
  sideWidth: 256,
  showTabs: true,
  watermark: false,
  grey: false,
  weakness: false,
  size: 'middle',
};
const storageKey = 'gea-appearance';
const Context = createContext<{
  config: Appearance;
  dark: boolean;
  update: (value: Partial<Appearance>) => void;
  reset: () => void;
} | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Appearance>(() => {
    try {
      const saved: Partial<Appearance> = JSON.parse(localStorage.getItem(storageKey) || '{}');
      // Previous releases persisted the default color even without customization.
      if (saved.primaryColor?.toLowerCase() === '#3b82f6') {
        saved.primaryColor = DEFAULT_PRIMARY_COLOR;
      }
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const dark = config.darkMode === 'auto' ? systemDark : config.darkMode === 'dark';
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setSystemDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch {
      // Internal implementation detail.
    }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--brand-primary', config.primaryColor);
    document.documentElement.style.filter =
      `${config.grey ? 'grayscale(1)' : ''} ${config.weakness ? 'invert(.8)' : ''}`.trim();
  }, [config, dark]);
  const value = useMemo(
    () => ({
      config,
      dark,
      update: (patch: Partial<Appearance>) => setConfig((prev) => ({ ...prev, ...patch })),
      reset: () => setConfig(defaults),
    }),
    [config, dark],
  );
  return (
    <Context.Provider value={value}>
      <ConfigProvider
        componentSize={config.size}
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: config.primaryColor,
            colorLink: config.primaryColor,
            borderRadius: 4,
            colorBgLayout: dark ? '#1e293b' : '#f9fafb',
            colorBgContainer: dark ? '#0f172a' : '#ffffff',
            colorBgElevated: dark ? '#0f172a' : '#ffffff',
            fontSize: 14,
            fontFamily: UI_FONT_FAMILY,
          },
          components: {
            Menu: { itemHeight: 48, itemMarginInline: 8, itemBorderRadius: 4 },
            Card: { paddingLG: 16 },
            Table: { headerBg: dark ? '#182230' : '#fafafa' },
            Button: { controlHeight: 32 },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </Context.Provider>
  );
}

export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error('AppearanceProvider message=');
  return value;
}
