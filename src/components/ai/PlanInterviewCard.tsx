import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, Send, X } from 'lucide-react';
import type { AIChatMessage } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  clearPlanDraft,
  loadPlanDraft,
  savePlanDraft,
} from '@/hooks/aiChat/planRecovery';
import {
  collectPlanQuestionEntries,
  formatPlanAnswer,
  formatPlanFeedback,
} from './plan-question-utils';

const CUSTOM_OPTION = '__plan-custom-answer__';
const collapsedStorageKey = (sessionUid: string) => `erd-builder:plan-interview:${sessionUid}:collapsed`;

function loadCollapsedState(sessionUid: string) {
  try {
    return localStorage.getItem(collapsedStorageKey(sessionUid)) === 'true';
  } catch {
    return false;
  }
}

interface PlanInterviewCardProps {
  sessionUid: string;
  messages: AIChatMessage[];
  isStreaming: boolean;
  onSubmit: (answer: string) => Promise<void>;
  onResume: (answer: string, clientMessageId?: string | null, phase?: 'initial' | 'follow-up') => Promise<void>;
}

export function PlanInterviewCard({ sessionUid, messages, isStreaming, onSubmit, onResume }: PlanInterviewCardProps) {
  const entries = useMemo(() => collectPlanQuestionEntries(messages), [messages]);
  const pendingInitialRequest = useMemo(() => [...messages].reverse().find(message =>
    message.role === 'user'
    && message.plan_mode
    && !message.content.startsWith('[Plan answer]')
    && !message.content.startsWith('[Plan feedback]')
    && Boolean(message.delivery_status)
  ), [messages]);
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState(() => loadCollapsedState(sessionUid));
  const [selected, setSelected] = useState<string[]>([]);
  const [customSelected, setCustomSelected] = useState(false);
  const [customAnswer, setCustomAnswer] = useState('');
  const [hydratedKey, setHydratedKey] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (entries.length) {
      setPage(entries.length - 1);
    }
  }, [entries.length]);

  const setCollapsedPreference = (value: boolean) => {
    setCollapsed(value);
    try {
      const key = collapsedStorageKey(sessionUid);
      if (value) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch {}
  };

  const entry = entries[page];
  useEffect(() => {
    if (!entry) return;
    let active = true;
    setHydratedKey('');
    const answer = entry.response?.kind === 'answer' ? entry.response : null;
    if (answer) {
      setSelected(answer.selected);
      setCustomSelected(Boolean(answer.customAnswer));
      setCustomAnswer(answer.customAnswer);
      setHydratedKey(entry.key);
      return;
    }

    setSelected([]);
    setCustomSelected(false);
    setCustomAnswer('');
    loadPlanDraft(sessionUid, entry.key)
      .then(draft => {
        if (!active || !draft) return;
        setSelected(draft.selected);
        setCustomSelected(draft.customSelected);
        setCustomAnswer(draft.customAnswer);
      })
      .finally(() => { if (active) setHydratedKey(entry.key); });
    return () => { active = false; };
  }, [entry?.key, entry?.response, sessionUid]);

  useEffect(() => {
    if (!entry || entry.response || hydratedKey !== entry.key) return;
    const timer = window.setTimeout(() => {
      savePlanDraft(sessionUid, entry.key, { selected, customSelected, customAnswer }).catch(() => {});
    }, 150);
    return () => window.clearTimeout(timer);
  }, [customAnswer, customSelected, entry, hydratedKey, selected, sessionUid]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [customAnswer]);

  if (!entry && !pendingInitialRequest) return null;
  if (collapsed) {
    return (
      <div className="shrink-0 border-t bg-background px-3 py-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setCollapsedPreference(false)}>
          Open Plan interview{entries.length ? ` · ${entries.length} ${entries.length === 1 ? 'question' : 'questions'}` : ''}
        </Button>
      </div>
    );
  }
  if (!entry && pendingInitialRequest) {
    const needsResume = pendingInitialRequest.delivery_status === 'needs-resume' && !isStreaming;
    return (
      <div className="shrink-0 border-t bg-background p-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Plan interview</CardTitle>
          </CardHeader>
          <CardFooter className="justify-between gap-3 border-t">
            <Badge variant="secondary">
              {needsResume ? 'Needs resume'
                : pendingInitialRequest.delivery_status === 'pending-assistant' ? 'Saving response'
                : 'Waiting for connection'}
            </Badge>
            {needsResume && (
              <Button size="sm" onClick={() => onResume(pendingInitialRequest.content, pendingInitialRequest.client_message_id, 'initial')}>
                <RotateCcw data-icon="inline-start" /> Resume
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  const responseIndex = entry.responseMessage
    ? messages.findIndex(message => message.id === entry.responseMessage?.id)
    : -1;
  const hasAssistantAfter = responseIndex >= 0 && messages
    .slice(responseIndex + 1)
    .some(message => message.role === 'assistant' && message.id !== 'streaming' && Boolean(message.content.trim()));
  const deliveryStatus = entry.responseMessage?.delivery_status;
  const waitingForConnection = deliveryStatus === 'pending';
  const savingResponse = deliveryStatus === 'pending-assistant';
  const needsResume = Boolean(entry.response && !hasAssistantAfter && !waitingForConnection && !isStreaming);
  const canEdit = !entry.response && page === entries.length - 1 && !isStreaming;
  const hasAnswer = selected.length > 0 || (customSelected && Boolean(customAnswer.trim()));

  const submit = async (content: string) => {
    await clearPlanDraft(sessionUid, entry.key).catch(() => {});
    await onSubmit(content);
  };

  const toggleOption = (option: string, checked: boolean) => {
    setSelected(previous => checked ? [...previous, option] : previous.filter(value => value !== option));
  };

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <Card size="sm" className="max-h-[55vh] overflow-y-auto">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">{entry.question.question}</CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-xs" disabled={page === 0} onClick={() => setPage(value => value - 1)} title="Previous question">
                <ChevronLeft />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">{page + 1} of {entries.length}</span>
              <Button variant="ghost" size="icon-xs" disabled={page === entries.length - 1} onClick={() => setPage(value => value + 1)} title="Next question">
                <ChevronRight />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setCollapsedPreference(true)} title="Collapse Plan interview">
                <X />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <fieldset disabled={!canEdit} className="flex flex-col gap-2">
            <legend className="sr-only">{entry.question.question}</legend>
            {entry.question.type === 'single' ? (
              <RadioGroup
                aria-label={entry.question.question}
                value={customSelected ? CUSTOM_OPTION : selected[0]}
                onValueChange={value => {
                  if (value === CUSTOM_OPTION) {
                    setSelected([]);
                    setCustomSelected(true);
                  } else {
                    setSelected([String(value)]);
                    setCustomSelected(false);
                  }
                }}
                className="flex flex-col gap-2"
              >
                {entry.question.options.map(option => (
                  <label key={option} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground has-[[data-checked]]:bg-muted has-[[data-checked]]:text-foreground">
                    <Radio.Root value={option} className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground" />
                    </Radio.Root>
                    <span>{option === entry.question.recommendedOption && <Badge variant="secondary" className="mr-1">Recommended</Badge>}{option}</span>
                  </label>
                ))}
                {entry.question.allowCustom && (
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground has-[[data-checked]]:bg-muted has-[[data-checked]]:text-foreground">
                    <Radio.Root value={CUSTOM_OPTION} className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground" />
                    </Radio.Root>
                    Other answer
                  </label>
                )}
              </RadioGroup>
            ) : (
              entry.question.options.map(option => (
                <label key={option} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground has-[[data-checked]]:bg-muted has-[[data-checked]]:text-foreground">
                  <Checkbox checked={selected.includes(option)} onCheckedChange={value => toggleOption(option, Boolean(value))} />
                  <span>{option === entry.question.recommendedOption && <Badge variant="secondary" className="mr-1">Recommended</Badge>}{option}</span>
                </label>
              ))
            )}
            {entry.question.type === 'multiple' && entry.question.allowCustom && (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground has-[[data-checked]]:bg-muted has-[[data-checked]]:text-foreground">
                <Checkbox checked={customSelected} onCheckedChange={value => setCustomSelected(Boolean(value))} />
                Other answer
              </label>
            )}
          </fieldset>

          {entry.question.allowCustom && (
            <Textarea
              ref={textareaRef}
              aria-label="Other answer"
              rows={1}
              value={customAnswer}
              onChange={event => setCustomAnswer(event.target.value)}
              placeholder="Other answer"
              disabled={!canEdit || !customSelected}
              className="min-h-10 resize-none text-xs"
            />
          )}
        </CardContent>

        <CardFooter className="justify-between gap-3 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {waitingForConnection ? <Badge variant="secondary">Waiting for connection</Badge>
              : savingResponse ? <Badge variant="secondary">Saving response</Badge>
              : needsResume ? <Badge variant="secondary">Needs resume</Badge>
              : entry.response ? <><CheckCircle2 className="size-4" /> Answered</>
              : 'Choose an option or add your own answer.'}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {needsResume ? (
              <Button size="sm" onClick={() => onResume(entry.responseMessage!.content, entry.responseMessage!.client_message_id, 'follow-up')}>
                <RotateCcw data-icon="inline-start" /> Resume
              </Button>
            ) : !entry.response ? (
              <>
                <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => submit(formatPlanFeedback(entry.question, 'skip'))}>Skip</Button>
                <Button size="sm" disabled={!canEdit || !hasAnswer} onClick={() => submit(formatPlanAnswer(entry.question, selected, customSelected ? customAnswer : ''))}>
                  <Send data-icon="inline-start" /> Continue
                </Button>
              </>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
