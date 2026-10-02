// Internal implementation detail.
import { useCallback } from 'react';
import CrudPage from '../../../features/crud/CrudPage';
import { f } from '../../../features/crud/fieldRenderers';
import type { PageInfo, PageResult } from '../../../types';
import { salesApi, type Customer2 } from '../api/service';

const list = (page: PageInfo): Promise<PageResult<Customer2>> => salesApi.getCustomer2List(page);

const fields = [
  f('name', 'Customer name', { inFilter: true }),
  f('phone', 'message='),
];

const beforeSubmit = (values: Record<string, unknown>, mode: 'create' | 'edit', row: Customer2 | null) => {
  if (mode === 'edit' && row) return { ...values, ID: row.ID };
  return values;
};

export default function Customer2Page() {
  return (
    <CrudPage<Customer2>
      fields={fields}
      list={list}
      create={values => salesApi.createCustomer2(values as Partial<Customer2>)}
      update={values => salesApi.updateCustomer2(values as Partial<Customer2>)}
      remove={row => salesApi.deleteCustomer2(row.ID)}
      removeBatch={ids => salesApi.deleteCustomer2ByIds(ids)}
      beforeSubmit={beforeSubmit}
    />
  );
}
