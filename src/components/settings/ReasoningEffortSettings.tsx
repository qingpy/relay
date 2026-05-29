import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Marginalia } from '@/components/ui/marginalia';
import { DEFAULT_REASONING_EFFORTS, getAppConfig, updateAppConfig } from '@/db/db';
import { SectionLabel } from './SectionLabel';

/**
 * Manage the GLOBAL list of reasoning-effort choices offered in preset settings.
 * The accepted set varies by model (GPT-5 adds `minimal`, some only do
 * `low`/`high`), so the list is the user's to curate — add / edit / delete here,
 * pick per preset in "Model & instructions".
 */
export function ReasoningEffortSettings() {
  const config = useLiveQuery(() => getAppConfig(), []);
  const [efforts, setEfforts] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (config && !seeded) {
      setEfforts(config.reasoningEfforts ?? DEFAULT_REASONING_EFFORTS);
      setSeeded(true);
    }
  }, [config, seeded]);

  const commit = (next: string[]) => {
    setEfforts(next);
    const cleaned = [...new Set(next.map((s) => s.trim()).filter(Boolean))];
    void updateAppConfig({ reasoningEfforts: cleaned });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Reasoning effort options</SectionLabel>
        <Marginalia onClick={() => commit([...efforts, ''])}>Add</Marginalia>
      </div>
      <p className="text-xs text-muted-foreground">
        The choices offered for reasoning models in a preset’s settings.
      </p>
      <div className="flex flex-col gap-1.5">
        {efforts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No options — add some, or presets fall back to the model default.
          </p>
        )}
        {efforts.map((value, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={value}
              spellCheck={false}
              placeholder="e.g. minimal, low, medium, high"
              onChange={(e) =>
                commit(efforts.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
            <button
              type="button"
              title="Remove option"
              onClick={() => commit(efforts.filter((_, j) => j !== i))}
              className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
