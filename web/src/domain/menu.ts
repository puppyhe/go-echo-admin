// Internal implementation detail.
// Internal implementation detail.
export interface MenuMeta {
  // Internal implementation detail.
  activeName?: string;
  // Internal implementation detail.
  keepAlive: boolean;
  // Internal implementation detail.
  defaultMenu: boolean;
  // Internal implementation detail.
  title: string;
  // Internal implementation detail.
  icon: string;
  // Internal implementation detail.
  closeTab: boolean;
  // Internal implementation detail.
  transitionType?: string;
  // Internal implementation detail.
  btns?: Record<string, number>;
  // Internal implementation detail.
  hidden?: boolean;
}

// Internal implementation detail.
export interface MenuParameter {
  ID: number;
  /** params | query */
  type: string;
  key: string;
  value: string;
}

// Internal implementation detail.
export interface MenuBtn {
  ID: number;
  // Internal implementation detail.
  name: string;
  desc: string;
  sysBaseMenuID: number;
}

// Internal implementation detail.
export interface MenuNode {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  parentId: number;
  // Internal implementation detail.
  path: string;
  // Internal implementation detail.
  name: string;
  hidden: boolean;
  // Internal implementation detail.
  component: string;
  sort: number;
  meta: MenuMeta;
  children: MenuNode[];
  parameters: MenuParameter[];
  menuBtn?: MenuBtn[];
  // Internal implementation detail.
  menuId?: number;
  // Internal implementation detail.
  btns: Record<string, number>;
}
