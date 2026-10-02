import { useEffect, useState } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMenu } from '../menu/MenuContext';
import { notificationsApi } from '../pages/enterprise/notifications/api';

export default function NotificationBell() {
  const menu = useMenu();
  const navigate = useNavigate();
  const path = menu.pathOf('notifyInbox') ?? menu.pathOf('enterpriseNotifications');
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const load = () => {
      void notificationsApi
        .list(1, false, true)
        .then((result) => {
          if (active) setCount(result.unread ?? 0);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener('gea-notifications-change', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('gea-notifications-change', load);
    };
  }, [path]);
  if (!path) return null;
  return (
    <Tooltip title="notification center">
      <Badge count={count} size="small" offset={[-4, 5]}>
        <Button
          shape="circle"
          icon={<BellOutlined />}
          aria-label="notification center"
          onClick={() => navigate(path)}
        />
      </Badge>
    </Tooltip>
  );
}
