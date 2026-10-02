// Internal implementation detail.
import { request } from '../../../api/request';
import type { PageInfo, PageResult } from '../../../types';

export interface Customer2 {
  ID: number;
  createdAt?: string;
  updatedAt?: string;
  name?: string;
  phone?: string;
}

export const salesApi = {
  createCustomer2: (data: Partial<Customer2>) =>
    request<void>('/sales/createCustomer2', { method: 'POST', body: data }),
  updateCustomer2: (data: Partial<Customer2>) =>
    request<void>('/sales/updateCustomer2', { method: 'PUT', body: data }),
  deleteCustomer2: (ID: number) =>
    request<void>('/sales/deleteCustomer2', { method: 'DELETE', params: { ID } }),
  deleteCustomer2ByIds: (ids: number[]) =>
    request<void>('/sales/deleteCustomer2ByIds', { method: 'DELETE', body: { ids } }),
  findCustomer2: (ID: number) =>
    request<Customer2>('/sales/findCustomer2', { method: 'GET', params: { ID } }),
  getCustomer2List: (page: PageInfo) =>
    request<PageResult<Customer2>>('/sales/getCustomer2List', { method: 'GET', params: page }),
};
