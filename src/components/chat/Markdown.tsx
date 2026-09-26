import { memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList, Plugin } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly';
import { gfmStrikethroughCjkFriendly } from 'micromark-extension-cjk-friendly-gfm-strikethrough';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
// Installs a global copy handler: selecting rendered math copies its LaTeX source.
import 'katex/dist/contrib/copy-tex.mjs';
import { CodeBlock } from './CodeBlock';

function stripZw(node: ReactNode): ReactNode {
  if (typeof node === 'string') return node.replace(/\u200b/g, '');
  if (Array.isArray(node)) return node.map(stripZw);
  return node;
}

const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  pre: CodeBlock,
  strong: ({ node: _node, children, ...props }) => (
    <strong {...props}>{stripZw(children)}</strong>
  ),
};

/** `singleTilde: false`: `~text~` stays literal; only `~~text~~` is strikethrough. */
const GFM_STRIKE = { singleTilde: false } as const;

/** CommonMark flanking drops ** / ~~ next to CJK punctuation (这是**“x”**的).
 *  Register the micromark extensions here so the production bundle cannot
 *  tree-shake them (the remark wrappers have `sideEffects: false`). */
const remarkCjkFriendly: Plugin = function remarkCjkFriendly() {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  const exts = data.micromarkExtensions || (data.micromarkExtensions = []);
  exts.push(cjkFriendlyExtension(), gfmStrikethroughCjkFriendly(GFM_STRIKE));
};

const remarkPlugins: PluggableList = [
  [remarkGfm, GFM_STRIKE],
  remarkCjkFriendly,
  remarkBreaks,
  remarkMath,
];
const rehypePlugins: PluggableList = [
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

/** CommonMark will not open/close `**` when an inner edge is punctuation
 *  (`word**—text.**`, `complete**.**`, `**[**`). Insert ZWSP so they parse as
 *  strong. Skip fences, inline code, math, and `|` so adjacent table cells
 *  (`**a** | **b**`) are not treated as one span. */
const STRONG = /\*\*([^*|\n]+)\*\*/gu;
const PUNCT_EDGE = /^[^\p{L}\p{N}]|[^\p{L}\p{N}]$/u;
const ZW = '\u200b';

function wrapPunctStrong(md: string): string {
  const apply = (s: string) =>
    s.replace(STRONG, (full, inner: string) =>
      inner.trim() && PUNCT_EDGE.test(inner) ? `**${ZW}${inner}${ZW}**` : full,
    );
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|\$\$[\s\S]*?\$\$)/)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      const open = Math.max(
        chunk.lastIndexOf('```'),
        chunk.lastIndexOf('~~~'),
        chunk.lastIndexOf('$$'),
      );
      const head = open >= 0 ? chunk.slice(0, open) : chunk;
      const tail = open >= 0 ? chunk.slice(open) : '';
      return (
        head
          .split(/(\$(?:\\\$|[^$\n])+\$|`[^`]*`)/)
          .map((c, j) => (j % 2 === 1 ? c : apply(c)))
          .join('') + tail
      );
    })
    .join('');
}

export const Markdown = memo(function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {wrapPunctStrong(children)}
      </ReactMarkdown>
    </div>
  );
});
