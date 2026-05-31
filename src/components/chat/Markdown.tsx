import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
// Installs a global copy handler: selecting rendered math copies its LaTeX source.
import 'katex/dist/contrib/copy-tex.mjs';
import { CodeBlock } from './CodeBlock';

const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  pre: CodeBlock,
};

const remarkPlugins: PluggableList = [remarkGfm, remarkMath];
const rehypePlugins: PluggableList = [
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

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
        {children}
      </ReactMarkdown>
    </div>
  );
});
