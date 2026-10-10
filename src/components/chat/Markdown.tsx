import { memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList, Plugin } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly';
import { gfmStrikethroughCjkFriendly } from 'micromark-extension-cjk-friendly-gfm-strikethrough';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
// Installs a global copy handler: selecting rendered math copies its LaTeX source.
import 'katex/dist/contrib/copy-tex.mjs';
import { CodeBlock } from './CodeBlock';
import {
  remarkHtmlBr,
  remarkMathChat,
  remarkRestorePipes,
  wrapPunctStrong,
} from '@/lib/markdown';

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

const rehypePlugins: PluggableList = [
  [rehypeKatex, { throwOnError: false, strict: false }],
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

export const Markdown = memo(function Markdown({
  children,
}: {
  children: string;
}) {
  const { text, plugins } = useMemo(() => {
    const remarkPlugins: PluggableList = [
      remarkMathChat,
      [remarkGfm, GFM_STRIKE],
      remarkCjkFriendly,
      remarkBreaks,
      remarkRestorePipes,
      remarkHtmlBr,
    ];
    return { text: wrapPunctStrong(children), plugins: remarkPlugins };
  }, [children]);

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={plugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
