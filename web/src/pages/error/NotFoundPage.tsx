// Internal implementation detail.
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { zh } from '../../locale/zh';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="notfound-page">
      <Result
        status="404"
        title="404"
        subTitle={zh['pageNotFound']}
        extra={<Button type="primary" onClick={() => navigate('/')}>{zh['returnHome']}</Button>}
      />
    </div>
  );
}
