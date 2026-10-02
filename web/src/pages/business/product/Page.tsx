import CrudPage from '../../../features/crud/CrudPage';
import type { CrudField } from '../../../features/crud/fieldRenderers';
import { productApi } from './api';
import { priceInCents, productForm, toProductInput, type Product, type ProductForm } from './model';

const fields: CrudField<Product & ProductForm>[] = [
  {
    key: 'keyword',
    title: 'message=',
    inTable: false,
    inForm: false,
    inFilter: true,
    maxLength: 200,
    placeholder: 'nameencoding',
  },
  { key: 'name', title: 'name', required: true, maxLength: 100 },
  { key: 'code', title: 'encoding', required: true, maxLength: 64 },
  {
    key: 'priceCents',
    title: 'message（message）',
    inForm: false,
    render: (value) => (Number(value) / 100).toFixed(2),
  },
  {
    key: 'priceYuan',
    title: 'message（message）',
    type: 'number',
    inTable: false,
    required: true,
    min: 0,
    max: 10_000_000_000,
    precision: 2,
    defaultValue: 0,
    rules: [
      {
        validator: async (_rule, value) => {
          priceInCents(value);
        },
      },
    ],
  },
  {
    key: 'status',
    title: 'status',
    type: 'select',
    required: true,
    inFilter: true,
    defaultValue: 'enabled',
    options: [
      { label: 'enable', value: 'enabled', color: 'success' },
      { label: 'disable', value: 'disabled' },
    ],
  },
  { key: 'note', title: 'message=', type: 'textarea', maxLength: 1000 },
  { key: 'createdAt', title: 'createmessage', inForm: false, inTable: { width: 180 } },
];

// Internal implementation detail.
export default function ProductPage() {
  return (
    <CrudPage<Product, ProductForm>
      rowKey="id"
      fields={fields}
      list={productApi.list}
      getDetail={productApi.get}
      toFormValues={productForm}
      create={(values) => productApi.create(toProductInput(values))}
      updateById={(id, values) => productApi.update(id, toProductInput(values))}
      remove={productApi.remove}
      auth={{ add: 'create', edit: 'update', delete: 'delete' }}
    />
  );
}
