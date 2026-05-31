import { useState, type ComponentPropsWithoutRef } from 'react';
import type { ExtraProps } from 'react-markdown';
import type { Element, ElementContent } from 'hast';
import { Marginalia } from '@/components/ui/marginalia';

/** Recursively gather the raw source text of a hast node (newlines intact). */
function nodeText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(nodeText).join('');
  return '';
}

/** The fenced language from a `<code>`'s `language-xxx` class, if any. */
function languageOf(code: Element | undefined): string {
  const cls = code?.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : [];
  const lang = list.find((c) => c.startsWith('language-'));
  return lang ? lang.slice('language-'.length) : '';
}

/**
 * Custom renderer for fenced code blocks: a quiet header bar carrying the
 * language label and a Copy action, over the highlighted source. Whether long
 * lines wrap or scroll is a global setting (Settings → Chats), applied as a
 * root class — so there's no per-block state here.
 */
export function CodeBlock({
  node,
  children,
}: ComponentPropsWithoutRef<'pre'> & ExtraProps) {
  const [copied, setCopied] = useState(false);

  const code = node?.children.find(
    (c): c is Element => c.type === 'element' && c.tagName === 'code',
  );
  const language = languageOf(code);
  const source = node ? node.children.map(nodeText).join('') : '';

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="code-block-lang">{language || 'code'}</span>
        <Marginalia onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Marginalia>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
