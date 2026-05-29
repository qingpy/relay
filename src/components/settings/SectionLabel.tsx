import type { ReactNode } from 'react';

/** Uppercase-monospace heading shared by every settings section. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="label-mono text-muted-foreground">{children}</h3>;
}
