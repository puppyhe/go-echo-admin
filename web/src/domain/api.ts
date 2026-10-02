// Internal implementation detail.
export interface SysApi {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  path: string;
  description: string;
  apiGroup: string;
  /** POST | GET | PUT | DELETE */
  method: string;
}

// Internal implementation detail.
export interface SysApiPayload {
  ID?: number;
  path: string;
  description: string;
  apiGroup: string;
  method: string;
}

// Internal implementation detail.
export interface CasbinInfo {
  path: string;
  method: string;
}
