import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { getSession, updateSessionSettings } from '@/db/repo';
import type { Session, SessionSettings } from '@/db/types';
import { getProvider } from '@/providers/registry';

export function ModelSettings({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => getSession(sessionId), [sessionId]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Model settings"
          aria-label="Model settings"
        >
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {session && <Panel key={session.id} session={session} />}
      </PopoverContent>
    </Popover>
  );
}

const SECTION = 'flex flex-col gap-1.5';
const ROW = 'flex items-center justify-between text-sm';

function Panel({ session }: { session: Session }) {
  const caps = getProvider(session.provider).capabilities;
  const s = session.settings;
  const [systemPrompt, setSystemPrompt] = useState(s.systemPrompt ?? '');

  const set = (patch: Partial<SessionSettings>) =>
    void updateSessionSettings(session.id, patch);

  const temperature = s.temperature ?? 1;
  const topP = s.topP ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <div className={SECTION}>
        <div className={ROW}>
          <span className="font-medium">Temperature</span>
          <span className="tabular-nums text-muted-foreground">
            {temperature.toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[temperature]}
          onValueChange={([v]) => set({ temperature: v })}
        />
      </div>

      <div className={SECTION}>
        <div className={ROW}>
          <span className="font-medium">Top P</span>
          <span className="tabular-nums text-muted-foreground">
            {topP.toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[topP]}
          onValueChange={([v]) => set({ topP: v })}
        />
      </div>

      <div className={SECTION}>
        <label className="font-medium">Max tokens</label>
        <Input
          type="number"
          min={1}
          placeholder="Provider default"
          value={s.maxTokens ?? ''}
          onChange={(e) =>
            set({ maxTokens: e.target.value ? Number(e.target.value) : undefined })
          }
        />
      </div>

      {caps.reasoning &&
        (session.provider === 'gemini' ? (
          <div className={SECTION}>
            <label className="font-medium">Thinking budget (tokens)</label>
            <Input
              type="number"
              min={0}
              placeholder="Auto"
              value={s.thinkingBudget ?? ''}
              onChange={(e) =>
                set({
                  thinkingBudget: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>
        ) : (
          <div className={SECTION}>
            <label className="font-medium">Reasoning effort</label>
            <select
              value={s.reasoningEffort ?? 'off'}
              onChange={(e) =>
                set({
                  reasoningEffort:
                    e.target.value === 'off'
                      ? undefined
                      : (e.target.value as 'low' | 'medium' | 'high'),
                })
              }
              className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="off">Off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        ))}

      <div className={SECTION}>
        <label className="font-medium">System prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            set({ systemPrompt: e.target.value || undefined });
          }}
          rows={4}
          placeholder="Optional instructions for the model…"
          className="resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
