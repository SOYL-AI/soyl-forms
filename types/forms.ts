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
  | "address"
  | "slider"
  | "section"
  | "media"
  | "signature"
  | "payment"
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
  /**
   * Computed question: `{q_price} * {q_qty}` over numeric answers.
   * Shown live, recomputed authoritatively on submit — never typed in.
   */
  formula?: string;
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

/** Postal address: street/city/postal (+ optional rest). */
export interface AddressBlock extends BaseBlock {
  type: "address";
}

/** Drag slider between min and max. */
export interface SliderBlock extends BaseBlock {
  type: "slider";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

/** Page break: a titled section screen inside the flow. */
export interface SectionBlock extends BaseBlock {
  type: "section";
  buttonLabel?: string;
}

/** Image / video embed shown as a full screen. */
export interface MediaBlock extends BaseBlock {
  type: "media";
  /** Required before publishing; may be empty while drafting. */
  mediaUrl?: string;
  mediaType?: "image" | "video";
  caption?: string;
}

/** Hand-drawn signature captured as a PNG data URL. */
export interface SignatureBlock extends BaseBlock {
  type: "signature";
}

/**
 * Collect money with the workspace's own Razorpay keys. Exactly one of
 * `amountPaise` (fixed price) or `amountFrom` (a numeric question id).
 */
export interface PaymentBlock extends BaseBlock {
  type: "payment";
  amountPaise?: number;
  amountFrom?: string;
  description?: string;
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
  | AddressBlock
  | SliderBlock
  | SectionBlock
  | MediaBlock
  | SignatureBlock
  | PaymentBlock
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

export interface LogicCondition {
  questionId: string;
  operator: LogicOperator;
  /** Option id / scalar answer to compare against. */
  value?: string | string[];
}

export interface LogicRule {
  id: string;
  /** Trigger condition (legacy single-condition shape, always evaluated). */
  when: LogicCondition;
  /** How `when` + `conditions` combine. Defaults to "all" (legacy). */
  match?: "all" | "any";
  /** Extra conditions on other questions. */
  conditions?: LogicCondition[];
  then: {
    action: "goto" | "end" | "hide";
    /** Jump/hide target. Omitted for "end" (finish the form). */
    blockId?: string;
  };
}

/** Translated strings for one locale, keyed by block / option id. */
export interface BlockTranslation {
  title?: string;
  description?: string;
  placeholder?: string;
  buttonLabel?: string;
  minLabel?: string;
  maxLabel?: string;
  acceptLabel?: string;
  caption?: string;
  options?: Record<string, string>;
  rows?: Record<string, string>;
  columns?: Record<string, string>;
}

export interface FormTranslation {
  title?: string;
  blocks?: Record<string, BlockTranslation>;
}

export interface FormSchemaV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  blocks: Block[];
  logic: LogicRule[];
  /** Extra locales (BCP 47-ish: en, hi, pt-BR). The base language is always the default. */
  locales?: string[];
  /** Per-locale strings; ids and logic never change across locales. */
  translations?: Record<string, FormTranslation>;
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
  /**
   * Declared hidden fields (Typeform-style `?name=...` keys). Values arriving
   * as URL parameters are stored with the response but never shown to the
   * respondent. The catch-all `collectQueryParams` behaviour is unchanged.
   */
  hiddenFields?: string[];
  /** Fill matching questions from URL parameters (`?email=a@b.com`). On by default. */
  prefillEnabled?: boolean;
  /** Respondent confirmation email (autoresponder). Off by default. */
  responderEnabled?: boolean;
  /** Custom autoresponder subject. `{{form_title}}` is replaced. */
  responderSubject?: string;
  /** Custom autoresponder message (plain text, `{{form_title}}` supported). */
  responderMessage?: string;
  /** Block id of the email question holding the recipient (default: first answered email question). */
  responderQuestionId?: string;
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
  | { type: "file_upload"; value: string[] }
  | {
      type: "address";
      value: {
        street?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal?: string;
        country?: string;
      };
    }
  | { type: "slider"; value: number }
  | { type: "signature"; value: string }
  | {
      type: "payment";
      value: { payment_id: string; order_id: string; amount_paise: number };
    };
