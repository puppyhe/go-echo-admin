// Internal implementation detail.
// Internal implementation detail.
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMenu } from '../menu/MenuContext';
import { matchingMenus } from '../menu/menuPaths';

// Internal implementation detail.
export function useBtnAuth(): (btnName: string) => boolean {
  const location = useLocation();
  const { nodeByPath } = useMenu();

  return useMemo(() => {
    const node = matchingMenus(nodeByPath, location.pathname).at(-1)?.[1];
    return (btnName: string): boolean => {
      if (!node?.btns) return false;
      return Object.prototype.hasOwnProperty.call(node.btns, btnName);
    };
  }, [nodeByPath, location.pathname]);
}
