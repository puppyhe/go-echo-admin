import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  richTextFragment,
  richTextNodes,
  richTextPlainText,
  sanitizeRichText,
} from '../../src/pages/plugin/announcement/richText';
const result = document.querySelector('#result')!;
const output: string[] = [];
function check(name: string, value: boolean) {
  if (!value) throw new Error(name);
  output.push(`PASS ${name}`);
}
try {
  const input =
    '<h2 onclick="window.__unsafe=1">title</h2><p>message <strong>message</strong> message <em>message</em></p><ul><li>listmessage</li><li>listmessage</li></ul><a href="https://example.com" style="background-image:url(javascript:1)" onclick="window.__unsafe=1">message</a><img src="/logo.png" onerror="window.__unsafe=1" alt="message"><script>window.__unsafe=1</script><iframe srcdoc="<script>window.__unsafe=1</script>"></iframe><svg><a href="javascript:alert(1)">bad</a></svg><a href="jav&#x61;script:alert(1)">message</a>';
  const safe = sanitizeRichText(input);
  const fragment = richTextFragment(safe);
  check(
    'formatting, lists, safe links and images survive',
    Boolean(fragment.querySelector('h2')) &&
      Boolean(fragment.querySelector('strong')) &&
      fragment.querySelectorAll('li').length === 2 &&
      fragment.querySelector('a')?.getAttribute('href') === 'https://example.com' &&
      Boolean(fragment.querySelector('img')),
  );
  check(
    'active content and event handlers are removed',
    !/script|iframe|svg|onclick|onerror|srcdoc|background-image/i.test(safe),
  );
  check(
    'encoded javascript links cannot execute',
    fragment.querySelectorAll('a')[1].getAttribute('href') === null,
  );
  check('safe HTML round trips without data loss', sanitizeRichText(safe) === safe);
  check(
    'plain text conversion preserves multiline content',
    richTextPlainText('message\nmessage') === 'message\nmessage',
  );
  const rendered = renderToStaticMarkup(<article>{richTextNodes(input)}</article>);
  check(
    'React preview preserves formatting without unsafe attributes',
    rendered.includes('<strong>message</strong>') &&
      !/onclick|onerror|<script|<iframe|javascript:/i.test(rendered),
  );
  createRoot(document.querySelector('#preview')!).render(<article>{richTextNodes(input)}</article>);
  result.textContent = output.join('\n') + `\nCOMPLETE ${output.length} browser DOM checks`;
} catch (error) {
  result.textContent = output.join('\n') + '\nFAIL ' + String(error);
}
