/**
 * Math as a micromark construct. Run: npx tsx src/lib/markdown.test.ts
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  remarkHtmlBr,
  remarkMathChat,
  remarkRestorePipes,
  wrapPunctStrong,
} from './markdown';

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  }
}

type N = {
  type: string;
  value?: string;
  url?: string;
  children?: N[];
};

function parse(md: string): N {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMathChat)
    .use(remarkGfm)
    .use(remarkBreaks);
  const tree = processor.runSync(
    processor.parse(wrapPunctStrong(md)),
  ) as N;
  (remarkRestorePipes() as (t: N) => void)(tree);
  (remarkHtmlBr() as (t: N) => void)(tree);
  return tree;
}

function walk(node: N, acc: N[] = []): N[] {
  acc.push(node);
  if (node.children) for (const c of node.children) walk(c, acc);
  return acc;
}

function maths(md: string) {
  return walk(parse(md))
    .filter((n) => n.type === 'inlineMath' || n.type === 'math')
    .map((n) => ({
      display: n.type === 'math',
      tex: (n.value ?? '').trim(),
    }));
}

function visible(md: string): string {
  const out: string[] = [];
  for (const n of walk(parse(md))) {
    if (n.type === 'text' && n.value) out.push(n.value);
    else if (n.type === 'inlineMath') out.push(`$${n.value}$`);
    else if (n.type === 'math') out.push(`$$${(n.value ?? '').trim()}$$`);
  }
  return out.join('').replace(/\u200b/g, '');
}

const currencyEscaped = `* **Single amounts:** The subscription fee is \\$12 per month.
* **Decimal values:** A standard coffee costs \\$4.75.
* **Multiple amounts in one line:** A ticket costs \\$25, a snack is \\$8, and parking is \\$10.
* **Large formatted numbers:** Total revenue was reported at \\$1,250,000.50.`;

eq('escaped currency: no math', maths(currencyEscaped), []);
eq(
  'escaped currency: renders as dollars',
  visible(currencyEscaped),
  'Single amounts: The subscription fee is $12 per month.Decimal values: A standard coffee costs $4.75.Multiple amounts in one line: A ticket costs $25, a snack is $8, and parking is $10.Large formatted numbers: Total revenue was reported at $1,250,000.50.',
);

eq('single \\$12 is not math', maths('The subscription fee is \\$12 per month.'), []);
eq('decimal \\$4.75 is not math', maths('A standard coffee costs \\$4.75.'), []);
eq(
  'multi \\$ on one line is not math',
  maths('A ticket costs \\$25, a snack is \\$8, and parking is \\$10.'),
  [],
);
eq('unescaped $5 and $3 is currency', maths('A coffee is $5 and tea is $3.'), []);
eq(
  'unescaped $25, $8, $10 is currency',
  maths('A ticket costs $25, a snack is $8, and parking is $10.'),
  [],
);
eq('bare $12 is currency', maths('The fee is $12 per month.'), []);
eq(
  'range \\$10-\\$20 is currency',
  maths('A range of \\$10-\\$20 should remain text.'),
  [],
);
eq('escaped \\$x = y\\$ is currency', maths('Escaped dollar: \\$x = y\\$'), []);

eq('inline math', maths('Einstein said $E=mc^2$.'), [
  { display: false, tex: 'E=mc^2' },
]);
eq('digit-leading math $2^n$', maths('Complexity $2^n$ grows fast.'), [
  { display: false, tex: '2^n' },
]);
eq('\\\\$ currency next to $x$ math', maths('Use \\$ for currency and $x$ for math.'), [
  { display: false, tex: 'x' },
]);
eq('display aligned', maths('$$\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}$$'), [
  { display: true, tex: '\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}' },
]);
eq('\\( is escaped paren, not math', maths('Inline \\(x^2\\) here.'), []);
eq('\\[ is escaped bracket, not math', maths('See \\[y^2\\].'), []);
eq(
  'escaped parens in URL are not math',
  maths('[Escaped](https://example.com/path/\\(escaped\\))'),
  [],
);
eq(
  'escaped parens in URL stay in the href',
  walk(parse('[Escaped](https://example.com/path/\\(escaped\\))')).some(
    (n) => n.type === 'link' && n.url === 'https://example.com/path/(escaped)',
  ),
  true,
);
eq('double-backtick code keeps $', maths('`` $x$ ``'), []);
eq(
  '4-backtick fence keeps inner $ and nested ```',
  maths('````md\n$x$\n```\n$y$\n```\n````'),
  [],
);
eq('single-backtick code keeps $', maths('`$x$`'), []);
eq('tilde fence keeps $', maths('~~~~\n$x$\n```\n$y$\n```\n~~~~'), []);
eq(
  'table cell $\\vert$ is math',
  maths('| Left | Right |\n| --- | --- |\n| n | $\\vert x \\vert \\le 1$ |'),
  [{ display: false, tex: '\\vert x \\vert \\le 1' }],
);
{
  const nodes = walk(
    parse('| a | `` `a | b` `` | c |\n| --- | --- | --- |\n| 1 | `` `x | y` `` | 3 |'),
  );
  const codes = nodes.filter((n) => n.type === 'inlineCode').map((n) => n.value);
  const cells = nodes.filter((n) => n.type === 'tableCell').length;
  eq('table pipe inside double-backtick code', codes, ['`a | b`', '`x | y`']);
  eq('table with code-pipes has 6 cells', cells, 6);
}
eq('blockquote math', maths('> $E=mc^2$'), [{ display: false, tex: 'E=mc^2' }]);
eq('list math', maths('- $E=mc^2$'), [{ display: false, tex: 'E=mc^2' }]);
eq('heading math', maths('# $E=mc^2$'), [{ display: false, tex: 'E=mc^2' }]);
eq('unclosed $$ is remainder math', maths('$$\nno closer'), [
  { display: true, tex: 'no closer' },
]);
eq('opener $ then space is not math', maths('foo$ $bar'), []);
eq(
  'two prices on two lines are not one math span',
  maths('The fee is $12 per month.\nA coffee costs $4.75.'),
  [],
);
eq(
  'rendered inline math',
  visible('Einstein said $E=mc^2$.'),
  'Einstein said $E=mc^2$.',
);
eq(
  'rendered mix',
  visible('Use \\$ for currency and $x$ for math.'),
  'Use $ for currency and $x$ for math.',
);
eq(
  'HTML block $ does not leak a token',
  walk(parse('<div>\n$x$\n</div>')).every(
    (n) => !String(n.value ?? '').includes('RLM'),
  ),
  true,
);
eq(
  'image dest with \\( is not math',
  maths('![x](https://example.com/\\(y\\))'),
  [],
);
eq(
  'link title with \\( stays a title',
  walk(parse('[L](https://example.com (Title with \\(escaped\\) parens))')).some(
    (n) => n.type === 'link' && !String(n.url ?? '').includes('RLM'),
  ),
  true,
);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ok');
