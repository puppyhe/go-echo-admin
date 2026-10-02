import { safeRichUrl } from './richText';

export interface AnnouncementAttachment {
  uid?: string | number;
  name: string;
  url: string;
}

/** Accept reference arrays and the existing Echo JSON-string storage without leaking Upload UI state. */
export function normalizeAttachments(input: unknown): AnnouncementAttachment[] {
  let value: unknown = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const files = new Map<string, AnnouncementAttachment>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const url = safeRichUrl(record.url, true);
    if (!url) continue;
    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name
        : url.split('/').pop() || 'attachment';
    const uid =
      typeof record.uid === 'number' || typeof record.uid === 'string' ? record.uid : undefined;
    files.set(url, { name, url, ...(uid !== undefined ? { uid } : {}) });
  }
  return [...files.values()];
}
