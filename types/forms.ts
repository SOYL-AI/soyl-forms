/**
 * FormSchemaV1 — the versioned, strongly-typed form definition.
 *
 * - Block/question IDs are stable: answers are keyed by block id, never by
 *   array index.
 * - Published versions are immutable snapshots of this schema.
 * - Conditional logic is validated data, not arbitrary code.
 */

export const SCHEMA_VERSION = 1 as const;

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
  | "file_upload"
  | "statement"
  | "thank_you";

export interface ChoiceOption {
  id: string;
  label: string;
}

interface BaseBlock {
  id: string;
  type: BlockType;
  /** Question or screen heading (creator-controlled plain text). */
  title: string;
  description?: string;
  required?: boolean;
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
  allowOther?: boolean;
}

export interface YesNoBlock extends BaseBlock {
  type: "yes_no";
}

export interface RatingBlock extends BaseBlock {
  type: "rating";
  /** Number of rating steps. */
  max?: 5 | 10;
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
  | FileUploadBlock
  | StatementBlock
  | ThankYouBlock;

export type LogicOperator = "equals" | "not_equals" | "contains" | "answered";

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

export interface FormTheme {
  background?: string;
  text?: string;
  accent?: string;
  buttonStyle?: "rounded" | "pill";
  font?: "sans" | "serif";
  logoUrl?: string;
}

export interface FormSettings {
  showProgress?: boolean;
  allowMultipleSubmissions?: boolean;
  closeAt?: string | null;
  submissionLimit?: number | null;
  closedMessage?: string;
  collectQueryParams?: boolean;
  buttonLabelNext?: string;
  buttonLabelSubmit?: string;
}

/** Answer payload keyed by stable block id (never array index). */
export type Answers = Record<string, AnswerValue>;

export type AnswerValue =
  | { type: "short_text" | "long_text" | "email" | "phone" | "url" | "date"; value: string }
  | { type: "number" | "rating" | "opinion_scale"; value: number }
  | { type: "single_choice" | "dropdown" | "yes_no"; value: string }
  | { type: "multiple_choice"; value: string[] }
  | { type: "file_upload"; value: string[] };
