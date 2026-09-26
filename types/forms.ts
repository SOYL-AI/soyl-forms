/**
 * FormSchemaV1 — the versioned, strongly-typed form definition.
 *
 * - Block/question IDs are stable: answers are keyed by block id, never by
 *   array index.
 * - Published versions are immutable snapshots of this schema.
 * - Conditional logic is validated data, not arbitrary code.
 * - New block types are additive; old published versions keep validating.
 */

export const SCHEMA_VERSION = 1 as const;

/** Sentinel option id used when a respondent picks "Other" and types a value. */
export const OTHER_OPTION_ID = "__other__";

export type BlockType =
  | "welcome"
  | "short_text"
  | "long_text"
  | "email"
  | "number"
  | "phone"
  | "url"
  | "single_choice"
  | "multiple_choice"
  | "dropdown"
  | "yes_no"
  | "rating"
  | "opinion_scale"
  | "date"
  | "time"
  | "matrix"
  | "ranking"
  | "nps"
  | "legal"
  | "file_upload"
  | "statement"
  | "thank_you";

export interface ChoiceOption {
  id: string;
  label: string;
  /** Picture choice: an image shown on the option card. */
  imageUrl?: string;
}

/** Quiz grading for a question (only used when the form's quiz mode is on). */
export interface QuizKey {
  /**
   * Accepted answers: option ids for choice questions ("yes"/"no" for yes/no),
   * accepted texts for short text (case-insensitive). Multiple choice needs
   * the exact set.
   */
  correct: string[];
  /** Points for a correct answer. Defaults to 1. */
  points?: number;
}

interface BaseBlock {
  id: string;
  type: BlockType;
  /** Question or screen heading (creator-controlled plain text). */
  title: string;
  description?: string;
  required?: boolean;
  /** Optional illustration shown above the title (creator-uploaded asset URL). */
  imageUrl?: string;
  imageAlt?: string;
  /** Quiz answer key. Stripped from the schema sent to respondents. */
  quiz?: QuizKey;
}

export interface WelcomeBlock extends BaseBlock {
  type: "welcome";
  buttonLabel?: string;
}

export interface TextBlock extends BaseBlock {
  type: "short_text" | "long_text" | "email" | "phone" | "url";
  placeholder?: string;
  validation?: {
    maxLength?: number;
    minLength?: number;
    pattern?: string;
  };
}

export interface NumberBlock extends BaseBlock {
  type: "number";
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
  };
}

export interface ChoiceBlock extends BaseBlock {
  type: "single_choice" | "multiple_choice" | "dropdown";
  options: ChoiceOption[];
  /** Adds an "Other" option with a free-text field. */
  allowOther?: boolean;
  /** Present options in a random order per respondent. */
  shuffle?: boolean;
  /** multiple_choice only: bound the number of selections. */
  minSelections?: number;
  maxSelections?: number;
}

export interface YesNoBlock extends BaseBlock {
  type: "yes_no";
}

export interface RatingBlock extends BaseBlock {
  type: "rating";
  /** Number of rating steps. */
  max?: 5 | 10;
  /** Visual style of each step. */
  icon?: "number" | "star" | "heart";
}

export interface OpinionScaleBlock extends BaseBlock {
  type: "opinion_scale";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface DateBlock extends BaseBlock {
  type: "date";
}

export interface TimeBlock extends BaseBlock {
  type: "time";
}

/** Grid question: one single-choice answer per row (Google Forms "grid"). */
export interface MatrixBlock extends BaseBlock {
  type: "matrix";
  rows: ChoiceOption[];
  columns: ChoiceOption[];
  /** Checkbox grid: several columns may be picked per row. */
  multiple?: boolean;
}

/** Order every option from most to least preferred. */
export interface RankingBlock extends BaseBlock {
  type: "ranking";
  options: ChoiceOption[];
}

/** Net Promoter Score: fixed 0–10 scale, scored as promoters − detractors. */
export interface NpsBlock extends BaseBlock {
  type: "nps";
  minLabel?: string;
  maxLabel?: string;
}

/** Consent checkbox with an optional policy link. */
export interface LegalBlock extends BaseBlock {
  type: "legal";
  acceptLabel?: string;
  linkUrl?: string;
  linkLabel?: string;
}

export interface FileUploadBlock extends BaseBlock {
  type: "file_upload";
  maxSizeMb?: number;
  allowedMimes?: string[];
}

export interface StatementBlock extends BaseBlock {
  type: "statement";
  buttonLabel?: string;
}

export interface ThankYouBlock extends BaseBlock {
  type: "thank_you";
  required?: never;
  /** Optional call-to-action shown on the final screen. */
  buttonLabel?: string;
  buttonUrl?: string;
}

export type Block =
  | WelcomeBlock
  | TextBlock
  | NumberBlock
  | ChoiceBlock
  | YesNoBlock
  | RatingBlock
  | OpinionScaleBlock
  | DateBlock
  | TimeBlock
  | MatrixBlock
  | RankingBlock
  | NpsBlock
  | LegalBlock
  | FileUploadBlock
  | StatementBlock
  | ThankYouBlock;

export type LogicOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "answered"
  | "not_answered"
  | "greater_than"
  | "less_than";

export interface LogicRule {
  id: string;
  when: {
    questionId: string;
    operator: LogicOperator;
    /** Option id / scalar answer to compare against. */
    value?: string | string[];
  };
  then: {
    action: "goto";
    blockId: string;
  };
}

export interface FormSchemaV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  blocks: Block[];
  logic: LogicRule[];
}

export type ButtonStyle = "rounded" | "pill" | "square";
export type ThemeRadius = "none" | "sm" | "md" | "lg" | "xl";

/**
 * Creator theme. `font` is the legacy serif/sans switch; `headingFont` /
 * `bodyFont` (curated ids from lib/forms/fonts.ts) win when present.
 */
export interface FormTheme {
  background?: string;
  text?: string;
  accent?: string;
  buttonStyle?: ButtonStyle;
  font?: "sans" | "serif";
  headingFont?: string;
  bodyFont?: string;
  radius?: ThemeRadius;
  logoUrl?: string;
  /** Where the logo sits on the respondent screen. */
  logoPlacement?: "top-left" | "top-center";
  /** Brand kit this theme was derived from, for "re-apply brand". */
  brandKitId?: string;
}

export interface FormSettings {
  showProgress?: boolean;
  /** Single-select questions advance automatically after a short beat. */
  autoAdvance?: boolean;
  allowMultipleSubmissions?: boolean;
  closeAt?: string | null;
  submissionLimit?: number | null;
  closedMessage?: string;
  collectQueryParams?: boolean;
  buttonLabelNext?: string;
  buttonLabelSubmit?: string;
  /** Send respondents here after the thank-you screen (https only). */
  redirectUrl?: string | null;
  /** Owner addresses to notify on each completed response (paid plans). */
  notifyEmails?: string[];
  /** Quiz mode: questions with an answer key are graded. */
  quizMode?: boolean;
  /** Quiz mode: show the respondent their score at the end (default on). */
  showScore?: boolean;
}

/** Answer payload keyed by stable block id (never array index). */
export type Answers = Record<string, AnswerValue>;

export type AnswerValue =
  | {
      type: "short_text" | "long_text" | "email" | "phone" | "url" | "date" | "time";
      value: string;
    }
  | { type: "number" | "rating" | "opinion_scale" | "nps"; value: number }
  | { type: "single_choice" | "dropdown"; value: string; otherText?: string }
  | { type: "yes_no"; value: string }
  | { type: "multiple_choice"; value: string[]; otherText?: string }
  | { type: "matrix"; value: Record<string, string | string[]> }
  | { type: "ranking"; value: string[] }
  | { type: "legal"; value: "accepted" }
  | { type: "file_upload"; value: string[] };
