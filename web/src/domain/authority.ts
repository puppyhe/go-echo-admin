// Internal implementation detail.
export interface SysAuthority {
  ID?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  // Internal implementation detail.
  authorityId: number;
  authorityName: string;
  code?: string;
  parentId: number | null;
  dataAuthorityId: SysAuthority[];
  children: SysAuthority[];
  // Internal implementation detail.
  menus?: unknown[];
  // Internal implementation detail.
  defaultRouter: string;
}

/** createrolerequest。 */
export interface CreateAuthorityPayload {
  authorityId?: number;
  authorityName: string;
  parentId: number;
  defaultRouter?: string;
}

// Internal implementation detail.
export interface SetDataAuthorityPayload {
  authorityId: number;
  dataAuthorityId: SysAuthority[];
}

// Internal implementation detail.
export interface CopyAuthorityPayload {
  authority: SysAuthority;
  oldAuthorityId: number;
}
