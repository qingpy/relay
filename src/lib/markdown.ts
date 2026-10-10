/**
 * Math is a micromark construct (`remark-math` / Cherry Studio / Streamdown):
 * code, links, HTML, and fences are the real parser's, not a second lexer.
 *
 * Inline `$` is single-line and rejects a closer followed by a digit (Pandoc),
 * so `$5 and $3` stays currency. `$$` is flow, so `aligned` keeps `|` / `&` /
 * `\\`. `\(` is CommonMark's escaped `(`, not math.
 *
 * `|` inside code is made inert before GFM tables tokenize (GFM splits cells
 * on raw `|`; GitHub documents `\|` / `&vert;` for the same reason).
 */

import { math as micromarkMath } from 'micromark-extension-math';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import { markdownLineEnding } from 'micromark-util-character';

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
}

/** Inert stand-in for `|` inside code so GFM tables do not split cells. */
const PIPE = '\uE000';

function copyCode(s: string): string {
  return s.includes('|') ? s.replace(/\|/g, PIPE) : s;
}

function fenceOpen(
  md: string,
  i: number,
): { marker: string; len: number; body: number } | null {
  let j = i;
  let spaces = 0;
  while (spaces < 3 && md[j] === ' ') {
    j++;
    spaces++;
  }
  const marker = md[j];
  if (marker !== '`' && marker !== '~') return null;
  let len = 0;
  while (md[j] === marker) {
    j++;
    len++;
  }
  if (len < 3) return null;
  const nl = md.indexOf('\n', j);
  const lineEnd = nl === -1 ? md.length : nl;
  if (marker === '`' && md.slice(j, lineEnd).includes('`')) return null;
  return { marker, len, body: nl === -1 ? md.length : nl + 1 };
}

function fenceClose(
  md: string,
  open: { marker: string; len: number; body: number },
): number {
  let i = open.body;
  while (i < md.length) {
    const line = i;
    let spaces = 0;
    while (spaces < 3 && md[i] === ' ') {
      i++;
      spaces++;
    }
    let n = 0;
    while (md[i] === open.marker) {
      i++;
      n++;
    }
    if (n >= open.len) {
      while (md[i] === ' ' || md[i] === '\t') i++;
      if (i >= md.length || md[i] === '\n') return i < md.length ? i + 1 : i;
    }
    const nl = md.indexOf('\n', line);
    if (nl === -1) return md.length;
    i = nl + 1;
  }
  return md.length;
}

function inlineCodeEnd(md: string, i: number): number {
  let n = 0;
  while (md[i + n] === '`') n++;
  if (n === 0) return -1;
  let j = i + n;
  while (j < md.length) {
    if (
      md[j] === '\n' &&
      (j + 1 >= md.length || md[j + 1] === '\n' || md[j + 1] === '\r')
    ) {
      return -1;
    }
    if (md[j] === '`') {
      let m = 0;
      while (md[j + m] === '`') m++;
      if (m === n) return j + m;
      j += m;
    } else {
      j++;
    }
  }
  return -1;
}

/** Run `fn` on markdown outside fenced / inline code (and unclosed fence tails). */
function mapNonCode(md: string, fn: (s: string) => string): string {
  let out = '';
  let prose = '';
  let i = 0;
  let lineStart = true;
  const flush = () => {
    if (prose) {
      out += fn(prose);
      prose = '';
    }
  };
  while (i < md.length) {
    if (lineStart) {
      const open = fenceOpen(md, i);
      if (open) {
        flush();
        const end = fenceClose(md, open);
        out += copyCode(md.slice(i, end));
        i = end;
        lineStart = true;
        continue;
      }
    }
    if (md[i] === '`') {
      const end = inlineCodeEnd(md, i);
      if (end !== -1) {
        flush();
        out += copyCode(md.slice(i, end));
        i = end;
        lineStart = false;
        continue;
      }
    }
    const c = md[i];
    prose += c;
    lineStart = c === '\n';
    i++;
  }
  flush();
  return out;
}

/**
 * micromark math (text) with Pandoc currency rules: inline `$` cannot span
 * lines, and a closer `$` followed by a digit is not a closer (`$5 and $3`).
 * `\$` is micromark's characterEscape. Flow `$$` is stock mathFlow.
 */
function mathTextPandoc() {
  return {
    tokenize: tokenizeMathText,
    resolve: resolveMathText,
    previous,
    name: 'mathText',
  };

  function tokenizeMathText(this: unknown, effects: any, ok: any, nok: any) {
    let sizeOpen = 0;
    let size = 0;
    let token: { type: string } | undefined;
    return start;

    function start(code: number): unknown {
      effects.enter('mathText');
      effects.enter('mathTextSequence');
      return sequenceOpen(code);
    }

    function sequenceOpen(code: number): unknown {
      if (code === 36) {
        effects.consume(code);
        sizeOpen++;
        return sequenceOpen;
      }
      effects.exit('mathTextSequence');
      // Pandoc: opener has a non-space immediately to its right.
      if (code === 32 || code === 9 || markdownLineEnding(code) || code === null) {
        return nok(code);
      }
      return between(code);
    }

    function between(code: number): unknown {
      if (code === null || markdownLineEnding(code)) return nok(code);
      if (code === 36) {
        token = effects.enter('mathTextSequence');
        size = 0;
        return sequenceClose(code);
      }
      if (code === 32) {
        effects.enter('space');
        effects.consume(code);
        effects.exit('space');
        return between;
      }
      effects.enter('mathTextData');
      return data(code);
    }

    function data(code: number): unknown {
      if (
        code === null ||
        code === 32 ||
        code === 36 ||
        markdownLineEnding(code)
      ) {
        effects.exit('mathTextData');
        return between(code);
      }
      effects.consume(code);
      return data;
    }

    function sequenceClose(code: number): unknown {
      if (code === 36) {
        effects.consume(code);
        size++;
        return sequenceClose;
      }
      if (size === sizeOpen) {
        // Pandoc: closer `$` followed by a digit is currency, not math.
        if (code >= 48 && code <= 57) {
          token!.type = 'mathTextData';
          return data(code);
        }
        effects.exit('mathTextSequence');
        effects.exit('mathText');
        return ok(code);
      }
      token!.type = 'mathTextData';
      return data(code);
    }
  }
}

function resolveMathText(events: any[]) {
  let tailExitIndex = events.length - 4;
  let headEnterIndex = 3;
  let index: number;
  let enter: number | undefined;
  if (
    (events[headEnterIndex][1].type === 'lineEnding' ||
      events[headEnterIndex][1].type === 'space') &&
    (events[tailExitIndex][1].type === 'lineEnding' ||
      events[tailExitIndex][1].type === 'space')
  ) {
    index = headEnterIndex;
    while (++index < tailExitIndex) {
      if (events[index][1].type === 'mathTextData') {
        events[tailExitIndex][1].type = 'mathTextPadding';
        events[headEnterIndex][1].type = 'mathTextPadding';
        headEnterIndex += 2;
        tailExitIndex -= 2;
        break;
      }
    }
  }
  index = headEnterIndex - 1;
  tailExitIndex++;
  while (++index <= tailExitIndex) {
    if (enter === undefined) {
      if (index !== tailExitIndex && events[index][1].type !== 'lineEnding') {
        enter = index;
      }
    } else if (index === tailExitIndex || events[index][1].type === 'lineEnding') {
      events[enter][1].type = 'mathTextData';
      if (index !== enter + 2) {
        events[enter][1].end = events[index - 1][1].end;
        events.splice(enter + 2, index - enter - 2);
        tailExitIndex -= index - enter - 2;
        index = enter + 2;
      }
      enter = undefined;
    }
  }
  return events;
}

function previous(this: { events: [string, { type: string }][] }, code: number) {
  return (
    code !== 36 ||
    this.events[this.events.length - 1][1].type === 'characterEscape'
  );
}

function mathChat() {
  const stock = micromarkMath({ singleDollarTextMath: true });
  return { flow: stock.flow, text: { 36: mathTextPandoc() } };
}

/** LLM `$$\begin{...}...\end{...}$$` → fence-style `$$` so micromark math-flow sees it. */
function normalizeDisplayMath(md: string): string {
  return mapNonCode(md, (s) =>
    s
      .replace(/\$\$(?=\\begin)/g, () => '$$\n')
      .replace(/(\\end\{[^}]+\})\$\$/g, (_m, end: string) => `${end}\n$$`),
  );
}

/** Math as a micromark construct; register before GFM. */
export function remarkMathChat(this: {
  data: () => {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };
}) {
  const data = this.data();
  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  micromarkExtensions.push(mathChat());
  fromMarkdownExtensions.push(mathFromMarkdown());
  toMarkdownExtensions.push(mathToMarkdown());
}

function restorePipeValue(n: Node): void {
  if (n.value && n.value.includes(PIPE)) n.value = n.value.replaceAll(PIPE, '|');
  if (n.children) for (const c of n.children) restorePipeValue(c);
}

/** Put `|` back after GFM tables have tokenized. */
export const remarkRestorePipes = () => (tree: { children?: Node[] }) => {
  if (tree.children) for (const n of tree.children) restorePipeValue(n);
};

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
 *  strong. Skip fences, inline code, and `|` so adjacent table cells
 *  (`**a** | **b**`) are not treated as one span.
 *  Inner `_` / `*` are emphasis markers (`**_Logos_**`), not punctuation. */
const STRONG = /\*\*([^*|\n]+)\*\*/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const ZW = '\u200b';

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
  return mapNonCode(normalizeDisplayMath(md), apply);
}
