// Internal implementation detail.
export interface Product {
  id: number;
  name: string;
  code: string;
  priceCents: number;
  status: 'enabled' | 'disabled';
  note: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Pick<Product, 'name' | 'code' | 'priceCents' | 'status' | 'note'>;
export type ProductForm = Omit<ProductInput, 'priceCents'> & {
  priceYuan: number;
  keyword?: string;
};

export function priceInCents(yuan: number): number {
  if (
    typeof yuan !== 'number' ||
    !Number.isFinite(yuan) ||
    yuan < 0 ||
    yuan > 10_000_000_000 ||
    Number(yuan.toFixed(2)) !== yuan ||
    !Number.isSafeInteger(Math.round(yuan * 100))
  )
    throw new Error('message0message10000000000message，message');
  return Math.round(yuan * 100);
}

export function toProductInput(values: ProductForm): ProductInput {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    priceCents: priceInCents(values.priceYuan),
    status: values.status,
    note: (values.note ?? '').trim(),
  };
}

export function productForm(row: Product): ProductForm {
  return {
    name: row.name,
    code: row.code,
    priceYuan: row.priceCents / 100,
    status: row.status,
    note: row.note,
  };
}
