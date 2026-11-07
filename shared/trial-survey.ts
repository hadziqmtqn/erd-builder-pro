/**
 * Trial survey v1 (CLD-013.3). The values are the SaaS contract keys; the labels belong to the runtime.
 * Changing a question or a value means a new `survey_version` in SaaS first.
 */
export const TRIAL_SURVEY_VERSION = 1;

export type TrialSurveyKey = "beta_trial" | "cloud_trial";

export const TRIAL_SURVEY_QUESTIONS = [
  {
    key: "disappointment",
    label: "Seberapa kecewa Anda kalau tidak bisa memakai ERD Builder Pro lagi?",
    options: [
      { value: "very_disappointed", label: "Sangat kecewa" },
      { value: "somewhat_disappointed", label: "Agak kecewa" },
      { value: "not_disappointed", label: "Tidak kecewa" },
    ],
  },
  {
    key: "primary_use",
    label: "Untuk apa Anda paling banyak memakainya?",
    options: [
      { value: "design_new_schema", label: "Merancang skema baru" },
      { value: "document_existing_database", label: "Mendokumentasikan database yang ada" },
      { value: "team_collaboration", label: "Kolaborasi dengan tim" },
      { value: "ai_features", label: "Fitur AI" },
      { value: "other", label: "Lainnya" },
    ],
  },
  {
    key: "main_blocker",
    label: "Apa yang paling menghambat Anda?",
    options: [
      { value: "hard_to_learn", label: "Sulit dipahami di awal" },
      { value: "missing_feature", label: "Fitur yang dibutuhkan belum ada" },
      { value: "slow_or_error", label: "Lambat atau error" },
      { value: "team_reluctant", label: "Tim sulit diajak pindah" },
      { value: "none", label: "Tidak ada hambatan" },
    ],
  },
] as const;

export const TRIAL_SURVEY_OPEN_ANSWER_LABEL: Record<TrialSurveyKey, string> = {
  beta_trial: "Satu hal yang paling ingin Anda ubah?",
  cloud_trial: "Apa yang membuat Anda ragu berlangganan?",
};

export const TRIAL_SURVEY_OPEN_ANSWER_MAX = 1000;

export type TrialSurveyAnswers = Record<(typeof TRIAL_SURVEY_QUESTIONS)[number]["key"], string> & { open_answer?: string };

/** Returns the answers in contract shape, or null when a required answer is missing or not a v1 value. */
export function normalizeTrialSurveyAnswers(value: unknown): TrialSurveyAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const question of TRIAL_SURVEY_QUESTIONS) {
    const answer = input[question.key];
    if (!question.options.some((option) => option.value === answer)) return null;
    answers[question.key] = answer as string;
  }
  const openAnswer = typeof input.open_answer === "string" ? input.open_answer.trim() : "";
  if (openAnswer.length > TRIAL_SURVEY_OPEN_ANSWER_MAX) return null;
  if (openAnswer) answers.open_answer = openAnswer;
  return answers as TrialSurveyAnswers;
}
