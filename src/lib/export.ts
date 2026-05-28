import type { Message, Session } from '@/db/types';
import { partsText } from './conversation';

interface ExportOptions {
  includeThinking?: boolean;
}

/** Markdown for a single message (no role heading). */
export function messageToMarkdown(m: Message, opts: ExportOptions = {}): string {
  if (m.role === 'divider') return '---\n\n*Context cleared*';

  let out = '';
  if (opts.includeThinking && m.reasoning) {
    const quoted = m.reasoning
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    out += `> **Thinking**\n>\n${quoted}\n\n`;
  }
  out += partsText(m.content);
  if (m.citations?.length) {
    out +=
      '\n\n**Sources:**\n' +
      m.citations
        .map((c, i) => `${i + 1}. [${c.title || c.url}](${c.url})`)
        .join('\n');
  }
  return out.trim();
}

/** Markdown for a whole conversation, with role headings. */
export function sessionToMarkdown(
  session: Session,
  messages: Message[],
  opts: ExportOptions = {},
): string {
  const lines = [`# ${session.title}`, ''];
  for (const m of messages) {
    if (m.role === 'divider') {
      lines.push('---', '');
      continue;
    }
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    lines.push(m.role === 'user' ? '## You' : '## Assistant', '');
    lines.push(messageToMarkdown(m, opts), '');
  }
  return lines.join('\n').trim() + '\n';
}

/** Markdown for a set of messages (used by multi-select copy/export). */
export function messagesToMarkdown(
  messages: Message[],
  opts: ExportOptions = {},
): string {
  return messages
    .map((m) => messageToMarkdown(m, opts))
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'chat'
  );
}

/** Trigger a client-side download of text content. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
