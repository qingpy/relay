import { ExternalLink } from 'lucide-react';
import type { Citation } from '@/db/types';

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-1 border-t border-border/60 pt-2.5">
      <div className="label-mono mb-2 text-muted-foreground">Sources</div>
      <ol className="flex flex-col gap-1.5">
        {citations.map((c, i) => (
          <li key={`${c.url}-${i}`} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
              {i + 1}
            </span>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group min-w-0 flex-1"
            >
              <span className="font-medium text-foreground group-hover:underline">
                {c.title || domain(c.url)}
              </span>
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-muted-foreground">
                {domain(c.url)}
                <ExternalLink className="size-3" />
              </span>
              {c.snippet && (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                  {c.snippet}
                </p>
              )}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
