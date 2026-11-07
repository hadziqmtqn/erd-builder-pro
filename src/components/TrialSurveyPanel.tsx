import React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  TRIAL_SURVEY_OPEN_ANSWER_LABEL,
  TRIAL_SURVEY_OPEN_ANSWER_MAX,
  TRIAL_SURVEY_QUESTIONS,
  type TrialSurveyKey,
} from "../../shared/trial-survey";

/**
 * Trial survey corner card (CLD-013.3). Not a modal: it never takes focus or blocks work. The server decides when it
 * shows (day 10 of the active Team's Trial until it ends, not after "later" until 00:00 WIB, never after an answer).
 */
export function TrialSurveyPanel({ teamId }: { teamId: string }) {
  const [surveyKey, setSurveyKey] = React.useState<TrialSurveyKey | null>(null);
  // Starts as a small card; the questions open only when the user asks for them.
  const [expanded, setExpanded] = React.useState(false);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [openAnswer, setOpenAnswer] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setSurveyKey(null);
    setExpanded(false);
    setAnswers({});
    setOpenAnswer("");
    setError(null);
    apiFetch("/api/cloud/trial-survey")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.show && (body.survey_key === "beta_trial" || body.survey_key === "cloud_trial")) setSurveyKey(body.survey_key);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [teamId]);

  if (!surveyKey) return null;

  const dismiss = () => {
    setSurveyKey(null);
    // A failed save only means the card returns on the next load.
    void apiFetch("/api/cloud/trial-survey/dismiss", { method: "POST" }).catch(() => {});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch("/api/cloud/trial-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { ...answers, open_answer: openAnswer } }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Terlalu banyak kiriman. Coba lagi nanti." : "Jawaban belum terkirim. Coba lagi.");
        return;
      }
      setSurveyKey(null);
      toast.success("Terima kasih! Jawaban Anda sudah kami terima.");
    } catch {
      setError("Jawaban belum terkirim. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="trial-survey-title"
      className="fixed bottom-20 right-4 z-40 flex max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-2rem))] flex-col rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 sm:right-6"
    >
      <div className={`flex items-start gap-2 px-4 py-3 ${expanded ? "border-b" : "pb-0"}`}>
        <div className="min-w-0 flex-1">
          <h2 id="trial-survey-title" className="text-sm font-semibold">Bagaimana Trial Anda sejauh ini?</h2>
          <p className="text-xs text-muted-foreground">4 pertanyaan singkat, kurang dari 1 menit.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Tutup, tampilkan lagi besok">
          <X aria-hidden="true" />
        </Button>
      </div>
      {!expanded ? (
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>Nanti saja</Button>
          <Button type="button" size="sm" onClick={() => setExpanded(true)}>Isi sekarang</Button>
        </div>
      ) : (
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <div className="space-y-4 overflow-y-auto px-4 py-3">
          {TRIAL_SURVEY_QUESTIONS.map((question, index) => (
            <fieldset key={question.key} className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium">{index + 1}. {question.label}</legend>
              {question.options.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted has-checked:bg-primary/10">
                  <input
                    type="radio"
                    name={`trial-survey-${question.key}`}
                    value={option.value}
                    checked={answers[question.key] === option.value}
                    onChange={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
                    className="size-4 accent-primary"
                    required
                    autoFocus={index === 0 && option === question.options[0]}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="space-y-1.5">
            <label htmlFor="trial-survey-open-answer" className="block text-sm font-medium">
              4. {TRIAL_SURVEY_OPEN_ANSWER_LABEL[surveyKey]} <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              id="trial-survey-open-answer"
              value={openAnswer}
              onChange={(event) => setOpenAnswer(event.target.value)}
              maxLength={TRIAL_SURVEY_OPEN_ANSWER_MAX}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </div>
        </div>
        <div className="border-t px-4 py-3">
          {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>Nanti saja</Button>
            <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Mengirim..." : "Kirim"}</Button>
          </div>
        </div>
      </form>
      )}
    </section>
  );
}
