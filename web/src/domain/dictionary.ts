// Internal implementation detail.
// Internal implementation detail.
export interface SysDictionary {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  // Internal implementation detail.
  name: string;
  // Internal implementation detail.
  type: string;
  status: boolean | null;
  description: string;
  parentID: number | null;
  children: SysDictionary[];
  sysDictionaryDetails: SysDictionaryDetail[];
}

// Internal implementation detail.
export interface SysDictionaryDetail {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  label: string;
  value: string;
  extend: string;
  status: boolean | null;
  sort: number;
  sysDictionaryID: number;
  parentID: number | null;
  children: SysDictionaryDetail[];
  level?: number;
  path?: string;
  disabled?: boolean;
}

// Internal implementation detail.
export interface DictionaryTreeNode {
  label: string;
  value: string;
  extend: string;
  disabled?: boolean;
  children?: DictionaryTreeNode[];
}

// Internal implementation detail.
export interface FindSysDictionaryResult {
  resysDictionary: SysDictionary;
}
