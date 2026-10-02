import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN.js';
import { AppearanceProvider } from './layout/AppearanceContext';
import { BrowserRouter } from 'react-router-dom';
import RootApp from './App';
import './styles.css';

// Theme palette uses a blue accent, subtle surfaces and compact rounded cards.
dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}>
    <AppearanceProvider>
      <AntApp>
        <BrowserRouter>
          <RootApp />
        </BrowserRouter>
      </AntApp>
    </AppearanceProvider>
  </ConfigProvider>,
);
