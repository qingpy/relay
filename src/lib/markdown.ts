/**
 * Math is lifted out of the markdown source before remark parses, then restored
 * as mdast math nodes. GFM tables, hard-breaks, and emphasis otherwise steal
 * `|`, `&`, and `\\` from `aligned` / similar environments. Placeholders are
 * inert (no `|`, `$`, `*`).
 */

export interface MathSlot {
  display: boolean;
  tex: string;
}

const TOKEN = (i: number) => `%%RLM${i}%%`;
const TOKEN_RE = /%%RLM(\d+)%%/g;

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
}

/** Run `fn` on markdown outside fenced / inline code (and unclosed fence tails). */
function mapNonCode(md: string, fn: (s: string) => string): string {
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      const open = Math.max(chunk.lastIndexOf('```'), chunk.lastIndexOf('~~~'));
      const head = open >= 0 ? chunk.slice(0, open) : chunk;
      const tail = open >= 0 ? chunk.slice(open) : '';
      return (
        head
          .split(/(`[^`]*`)/)
          .map((c, j) => (j % 2 === 1 ? c : fn(c)))
          .join('') + tail
      );
    })
    .join('');
}

export function protectMath(md: string): { text: string; slots: MathSlot[] } {
  const slots: MathSlot[] = [];
  const take = (display: boolean, tex: string) => {
    const i = slots.length;
    slots.push({ display, tex: tex.trim() });
    // Display tokens sit on their own lines so 4-space indent cannot trap
    // them as a CommonMark code block (the usual leftover for `aligned`).
    return display ? `\n\n${TOKEN(i)}\n\n` : TOKEN(i);
  };
  const text = mapNonCode(md, (s) => {
    let out = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
      take(true, tex),
    );
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => take(true, tex));
    out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) =>
      take(false, tex),
    );
    out = out.replace(
      /(?<!\$)\$(?!\$)((?:\\\$|[^$\n])+)\$(?!\$)/g,
      (_, tex: string) => take(false, tex),
    );
    return out;
  });
  return { text, slots };
}

function mathNode(slot: MathSlot): Node {
  if (slot.display) {
    return {
      type: 'math',
      meta: null,
      value: slot.tex,
      data: {
        hName: 'div',
        hProperties: { className: ['math', 'math-display'] },
        hChildren: [{ type: 'text', value: slot.tex }],
      },
    };
  }
  return {
    type: 'inlineMath',
    value: slot.tex,
    data: {
      hName: 'span',
      hProperties: { className: ['math', 'math-inline'] },
      hChildren: [{ type: 'text', value: slot.tex }],
    },
  };
}

function splitMathText(value: string, slots: MathSlot[]): Node[] {
  const out: Node[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    const slot = slots[Number(m[1])];
    if (slot) out.push(mathNode(slot));
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out.length ? out : [{ type: 'text', value }];
}

function restoreWalk(nodes: Node[], slots: MathSlot[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.type === 'inlineCode' || n.type === 'math' || n.type === 'inlineMath') {
      out.push(n);
      continue;
    }
    if (n.type === 'code' && n.value && n.value.includes('%%RLM')) {
      const parts = splitMathText(n.value.trim(), slots);
      if (parts.length === 1 && (parts[0].type === 'math' || parts[0].type === 'inlineMath')) {
        out.push(parts[0]);
        continue;
      }
      out.push(n);
      continue;
    }
    if (n.type === 'code') {
      out.push(n);
      continue;
    }
    if (n.type === 'text' && n.value && n.value.includes('%%RLM')) {
      out.push(...splitMathText(n.value, slots));
      continue;
    }
    if (n.children) n.children = restoreWalk(n.children, slots);
    out.push(n);
  }
  return out;
}

/** A paragraph that is only a display-math node becomes a block (not a `<p>`). */
function liftDisplay(nodes: Node[]): Node[] {
  return nodes.flatMap((n) => {
    if (n.children) n.children = liftDisplay(n.children);
    if (n.type === 'paragraph' && n.children) {
      const meaningful = n.children.filter(
        (c) => !(c.type === 'text' && !c.value?.trim()),
      );
      if (meaningful.length === 1 && meaningful[0].type === 'math') {
        return [meaningful[0]];
      }
    }
    return [n];
  });
}

export function remarkRestoreMath(slots: MathSlot[]) {
  return () => (tree: { children?: Node[] }) => {
    if (!slots.length || !tree.children) return;
    tree.children = liftDisplay(restoreWalk(tree.children, slots));
  };
}

const BR_ONLY = /^<br\s*\/?>$/i;
const BR_IN_TEXT = /<br\s*\/?>/gi;

function splitBr(value: string): Node[] {
  const parts = value.split(BR_IN_TEXT);
  if (parts.length === 1) return [{ type: 'text', value }];
  const out: Node[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) out.push({ type: 'text', value: parts[i] });
    if (i < parts.length - 1) out.push({ type: 'break' });
  }
  return out;
}

function brWalk(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (
      n.type === 'code' ||
      n.type === 'inlineCode' ||
      n.type === 'math' ||
      n.type === 'inlineMath'
    ) {
      out.push(n);
      continue;
    }
    if (n.type === 'html' && n.value && BR_ONLY.test(n.value.trim())) {
      out.push({ type: 'break' });
      continue;
    }
    if (n.type === 'text' && n.value && /<br\s*\/?>/i.test(n.value)) {
      out.push(...splitBr(n.value));
      continue;
    }
    if (n.children) n.children = brWalk(n.children);
    out.push(n);
  }
  return out;
}

/** `<br>` / `<br/>` in prose and GFM table cells become hard breaks. */
export const remarkHtmlBr = () => (tree: { children?: Node[] }) => {
  if (tree.children) tree.children = brWalk(tree.children);
};

/** CommonMark will not open/close `**` when an inner edge is punctuation
 *  (`word**—text.**`, `complete**.**`, `**[**`). Insert ZWSP so they parse as
 *  strong. Skip fences, inline code, math tokens, and `|` so adjacent table
 *  cells (`**a** | **b**`) are not treated as one span.
 *  Inner `_` / `*` are emphasis markers (`**_Logos_**`), not punctuation. */
const STRONG = /\*\*([^*|\n]+)\*\*/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const ZW = '\u200b';

/** Punctuation at a `**` edge, excluding `*` / `_` (those open inner emphasis). */
function punctEdge(inner: string): boolean {
  const a = inner.charAt(0);
  const b = inner.charAt(inner.length - 1);
  return (
    (!!a && a !== '*' && a !== '_' && !WORD_CHAR.test(a)) ||
    (!!b && b !== '*' && b !== '_' && !WORD_CHAR.test(b))
  );
}

export function wrapPunctStrong(md: string): string {
  const apply = (s: string) =>
    s.replace(STRONG, (full, inner: string) =>
      inner.trim() && punctEdge(inner) ? `**${ZW}${inner}${ZW}**` : full,
    );
  return mapNonCode(md, apply);
}
