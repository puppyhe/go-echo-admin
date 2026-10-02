import type { SysDictionary, SysDictionaryDetail } from '../../../domain/dictionary';

export function normalizeDetail(raw: SysDictionaryDetail): SysDictionaryDetail {
  const item = raw as SysDictionaryDetail & { id?: number };
  return {
    ...item,
    ID: Number(item.ID ?? item.id),
    value: String(item.value ?? ''),
    parentID: item.parentID || null,
    children: (item.children ?? []).map(normalizeDetail),
  };
}

/** Keep the ancestors of matching items, so a search never hides a match's context. */
export function filterDetailTree(
  nodes: SysDictionaryDetail[],
  query: string,
): SysDictionaryDetail[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return nodes;
  return nodes.flatMap((node) => {
    const children = filterDetailTree(node.children ?? [], term);
    return node.label.toLocaleLowerCase().includes(term) || children.length
      ? [{ ...node, children }]
      : [];
  });
}

export interface ParentOption {
  value: number;
  title: string;
  disabled?: boolean;
  children?: ParentOption[];
}

/** Remove the edited node's entire subtree: descendants cannot become its parent. */
export function detailParentOptions(
  nodes: SysDictionaryDetail[],
  editedId?: number,
): ParentOption[] {
  return nodes
    .filter((node) => node.ID !== editedId)
    .map((node) => ({
      value: node.ID,
      title: `${node.label}（${node.value}）${node.disabled ? ' · disabled' : ''}`,
      children: detailParentOptions(node.children ?? [], editedId),
    }));
}

export function dictionaryParentOptions(items: SysDictionary[], editedId?: number): ParentOption[] {
  const excluded = new Set<number>(editedId === undefined ? [] : [editedId]);
  // Bounded fixed point also tolerates malformed legacy cycles without hanging the editor.
  for (let i = 0; i < items.length; i++) {
    let changed = false;
    items.forEach((item) => {
      if (item.parentID && excluded.has(item.parentID) && !excluded.has(item.ID)) {
        excluded.add(item.ID);
        changed = true;
      }
    });
    if (!changed) break;
  }
  return items
    .filter((item) => !excluded.has(item.ID))
    .map((item) => ({
      value: item.ID,
      title: `${item.name}（${item.type}）`,
    }));
}

export function detailPayload(
  values: Partial<SysDictionaryDetail>,
  dictionaryId: number,
  editedId?: number,
) {
  return {
    ...(editedId === undefined ? {} : { ID: editedId }),
    sysDictionaryID: dictionaryId,
    parentID: values.parentID || null,
    label: values.label?.trim() ?? '',
    // Do not coerce through Number: codes such as "001" and "false" are valid dictionary values.
    value: String(values.value ?? ''),
    extend: values.extend ?? '',
    status: values.status === true,
    sort: values.sort ?? 0,
  };
}
