import { AuthenticatedImg, FileLink } from '../../../features/upload/AuthenticatedAsset';
import { createElement, type ReactNode } from 'react';

const ALLOWED = new Set([
  'p',
  'div',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'img',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);
const DISCARD = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
]);

/** Accept local files and ordinary web links; never preserve executable/data/blob URLs. */
export function safeRichUrl(value: unknown, image = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f]/.test(url) || url.startsWith('//') || url.includes('\\'))
    return undefined;
  if (!image && /^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) return undefined;
  try {
    const parsed = new URL(url, 'https://local.invalid');
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** Parse into an inert document, then copy only allowed nodes and attributes into a clean fragment. */
export function richTextFragment(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createDocumentFragment();
  const copy = (source: Node, target: Node) => {
    if (source.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(source.textContent ?? ''));
      return;
    }
    if (source.nodeType !== Node.ELEMENT_NODE) return;
    const original = source as Element;
    const tag = original.tagName.toLowerCase();
    if (DISCARD.has(tag)) return;
    if (!ALLOWED.has(tag)) {
      original.childNodes.forEach((child) => copy(child, target));
      return;
    }
    const node = document.createElement(tag);
    if (tag === 'a') {
      const href = safeRichUrl(original.getAttribute('href'));
      if (href) {
        node.setAttribute('href', href);
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'img') {
      const src = safeRichUrl(original.getAttribute('src'), true);
      if (!src) return;
      node.setAttribute('src', src);
      node.setAttribute('alt=', original.getAttribute('alt=') ?? 'message=');
    }
    if (tag === 'td' || tag === 'th') {
      for (const attr of ['colspan', 'rowspan']) {
        const value = Number(original.getAttribute(attr));
        if (Number.isInteger(value) && value > 0 && value <= 20)
          node.setAttribute(attr, String(value));
      }
    }
    const align = (original as HTMLElement).style.textAlign;
    if (['left', 'center', 'right', 'justify'].includes(align)) node.style.textAlign = align;
    original.childNodes.forEach((child) => copy(child, node));
    target.appendChild(node);
  };
  parsed.body.childNodes.forEach((child) => copy(child, output));
  return output;
}

export function sanitizeRichText(html: string): string {
  const wrapper = document.createElement('div');
  wrapper.appendChild(richTextFragment(html));
  return wrapper.innerHTML;
}

export function richTextPlainText(html: string): string {
  return richTextFragment(html).textContent?.trim() ?? '';
}

/** Render the sanitized document as React nodes, without injecting an HTML string. */
export function richTextNodes(
  html: string,
  imageUrl: (url: string) => string = (value) => value,
): ReactNode[] {
  const render = (node: Node, key: string): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const props: Record<string, unknown> = { key };
    if (tag === 'a' && element.hasAttribute('href'))
      Object.assign(props, {
        href: element.getAttribute('href'),
        target: '_blank',
        rel: 'noopener noreferrer',
      });
    if (tag === 'img')
      Object.assign(props, {
        src: imageUrl(element.getAttribute('src') ?? ''),
        alt: element.getAttribute('alt=') ?? '',
        loading: 'lazy',
      });
    if (element.style.textAlign) props.style = { textAlign: element.style.textAlign };
    if (element.hasAttribute('colspan')) props.colSpan = Number(element.getAttribute('colspan'));
    if (element.hasAttribute('rowspan')) props.rowSpan = Number(element.getAttribute('rowspan'));
    if (tag === 'img') return createElement(AuthenticatedImg, props);
    if (['br', 'hr'].includes(tag)) return createElement(tag, props);
    return createElement(
      tag === 'a' ? FileLink : tag,
      props,
      ...Array.from(element.childNodes, (child, index) => render(child, `${key}-${index}`)),
    );
  };
  return Array.from(richTextFragment(html).childNodes, (node, index) =>
    render(node, String(index)),
  );
}
