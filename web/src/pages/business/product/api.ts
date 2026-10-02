import { request } from '../../../api/request';
import type { PageInfo, PageResult } from '../../../types';
import type { Product, ProductInput } from './model';

const base = '/products';
export const productApi = {
  list: ({ page, pageSize, keyword, status }: PageInfo) =>
    request<PageResult<Product>>(base, { params: { page, pageSize, keyword, status } }),
  get: (id: number) => request<Product>(`${base}/${id}`),
  create: (body: ProductInput) => request<Product>(base, { method: 'POST', body }),
  update: (id: number, body: ProductInput) =>
    request<Product>(`${base}/${id}`, { method: 'PUT', body }),
  remove: (row: Product) => request<void>(`${base}/${row.id}`, { method: 'DELETE' }),
};
