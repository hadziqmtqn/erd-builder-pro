import { useMemo, useState } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatPlanAnswer, type PlanQuestion } from './plan-question-utils';

const CUSTOM_OPTION = '__plan-custom-answer__';

interface PlanQuestionsProps {
  question: PlanQuestion;
  isAnswered: boolean;
  onSubmit: (answer: string) => void;
}

export function PlanQuestions({ question, isAnswered, onSubmit }: PlanQuestionsProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [customSelected, setCustomSelected] = useState(false);
  const [customAnswer, setCustomAnswer] = useState('');
  const hasAnswer = useMemo(
    () => selected.length > 0 || (customSelected && Boolean(customAnswer.trim())),
    [selected, customAnswer, customSelected],
  );
  const disabled = isAnswered;

  const toggleOption = (option: string, checked: boolean) => {
    setSelected(previous => checked ? [...previous, option] : previous.filter(value => value !== option));
  };

  return (
    <Card size="sm" className="mt-3 w-full max-w-none">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">One question before the plan</CardTitle>
          <Badge variant="secondary">Plan</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-xs font-medium text-foreground">{question.question}</p>
        {question.type === 'single' ? (
          <RadioGroup
            aria-label={question.question}
            value={customSelected ? CUSTOM_OPTION : selected[0]}
            onValueChange={value => {
              if (value === CUSTOM_OPTION) {
                setSelected([]);
                setCustomSelected(true);
                return;
              }
              setCustomSelected(false);
              setSelected([String(value)]);
            }}
            disabled={disabled}
            className="flex flex-col gap-2"
          >
            {question.options.map(option => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground has-[[data-checked]]:text-foreground">
                <Radio.Root value={option} className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50">
                  <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground" />
                </Radio.Root>
                <span>{option === question.recommendedOption && <span className="text-muted-foreground">(Recommended) </span>}{option}</span>
              </label>
            ))}
            {question.allowCustom && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground has-[[data-checked]]:text-foreground">
                <Radio.Root value={CUSTOM_OPTION} className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50">
                  <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground" />
                </Radio.Root>
                <span>Other answer</span>
              </label>
            )}
          </RadioGroup>
        ) : (
          <div className="flex flex-col gap-2">
            {question.options.map(option => {
              const checked = selected.includes(option);
              return (
                <label key={option} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground has-[[data-checked]]:text-foreground">
                  <Checkbox checked={checked} onCheckedChange={value => toggleOption(option, value)} disabled={disabled} />
                  <span>{option === question.recommendedOption && <span className="text-muted-foreground">(Recommended) </span>}{option}</span>
                </label>
              );
            })}
            {question.allowCustom && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground has-[[data-checked]]:text-foreground">
                <Checkbox checked={customSelected} onCheckedChange={value => setCustomSelected(Boolean(value))} disabled={disabled} />
                <span>Other answer</span>
              </label>
            )}
          </div>
        )}
        {question.allowCustom && (
          <Textarea
            aria-label="Other answer"
            rows={1}
            value={customAnswer}
            onChange={event => {
              setCustomAnswer(event.target.value);
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            placeholder="Other answer"
            disabled={disabled || !customSelected}
            className="min-h-10 resize-none text-xs"
          />
        )}
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <p className="text-xs text-muted-foreground">{isAnswered ? 'Answered in this conversation.' : 'Choose an option or add your own answer.'}</p>
        <Button size="sm" onClick={() => onSubmit(formatPlanAnswer(question, selected, customSelected ? customAnswer : ''))} disabled={!hasAnswer || disabled}>
          {isAnswered ? <CheckCircle2 data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          {isAnswered ? 'Answered' : 'Continue'}
        </Button>
      </CardFooter>
    </Card>
  );
}
