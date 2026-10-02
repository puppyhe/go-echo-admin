// Internal implementation detail.
import { Alert, Empty } from 'antd';
import { pageRegistrationHint } from '../routes/pageKeys';
import { zh } from '../locale/zh';

export default function PlaceholderPage({ component }: { component: string }) {
  const pageName = component.split('/').filter(Boolean).at(-1)?.replace(/[A-Z]/g, (value) => ` ${value}`).trim() || 'page';
  return (
    <div className="placeholder-page">
      <Empty
        description={
          <span>
            {zh['pageNotConfigured'].replace('{page}', pageName)}
            <br />
            <code className="muted">{component}</code>
          </span>
        }
      />
      {import.meta.env.DEV && (
        <Alert
          type="warning"
          showIcon
          message={zh['pageRegistrationDetails']}
          description={pageRegistrationHint(component)}
        />
      )}
    </div>
  );
}
