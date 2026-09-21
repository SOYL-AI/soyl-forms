import type { FormSchemaV1 } from "@/types/forms";

/** Hardcoded demo form for Phase 1 (`/f/demo`). Replaced by DB content in Phase 3. */
export const demoForm: FormSchemaV1 = {
  schemaVersion: 1,
  title: "Design feedback, minus the boring survey",
  blocks: [
    {
      id: "blk_welcome",
      type: "welcome",
      title: "Help us shape something people love answering",
      description: "Five quick questions · about a minute · no account needed",
      buttonLabel: "Start",
    },
    {
      id: "q_name",
      type: "short_text",
      title: "What should we call you?",
      description: "First name is plenty.",
      required: true,
      placeholder: "Ada",
      validation: { maxLength: 100 },
    },
    {
      id: "q_role",
      type: "single_choice",
      title: "What best describes you?",
      required: true,
      options: [
        { id: "opt_founder", label: "Founder" },
        { id: "opt_designer", label: "Designer" },
        { id: "opt_developer", label: "Developer" },
        { id: "opt_student", label: "Student" },
      ],
    },
    {
      id: "q_college",
      type: "short_text",
      title: "Which college are you at?",
      required: false,
      placeholder: "Your college",
      validation: { maxLength: 150 },
    },
    {
      id: "q_topics",
      type: "multiple_choice",
      title: "What should we ask about more often?",
      description: "Pick as many as you like.",
      required: true,
      options: [
        { id: "opt_pricing", label: "Pricing" },
        { id: "opt_templates", label: "Templates" },
        { id: "opt_integrations", label: "Integrations" },
        { id: "opt_mobile", label: "Mobile experience" },
      ],
    },
    {
      id: "q_recommend",
      type: "yes_no",
      title: "Would you recommend a form like this to a friend?",
      required: true,
    },
    {
      id: "q_rating",
      type: "rating",
      title: "How smooth did this feel?",
      description: "1 is clunky, 5 is delightful.",
      required: true,
      max: 5,
    },
    {
      id: "q_notes",
      type: "long_text",
      title: "Anything else on your mind?",
      description: "Optional — a sentence or two is perfect.",
      required: false,
      placeholder: "Type here… (Shift + Enter for a new line)",
      validation: { maxLength: 2000 },
    },
    {
      id: "blk_thanks",
      type: "thank_you",
      title: "Thanks — that's everything.",
      description: "This is a demo, so nothing was stored. The real thing saves every response.",
    },
  ],
  logic: [
    {
      id: "rule_student_college",
      when: { questionId: "q_role", operator: "equals", value: "opt_student" },
      then: { action: "goto", blockId: "q_college" },
    },
    {
      id: "rule_skip_college",
      when: {
        questionId: "q_role",
        operator: "not_equals",
        value: "opt_student",
      },
      then: { action: "goto", blockId: "q_topics" },
    },
  ],
};

/** Tiny 3-step form embedded in the marketing hero. */
export const heroMiniForm: FormSchemaV1 = {
  schemaVersion: 1,
  title: "Try it right here",
  blocks: [
    {
      id: "m_welcome",
      type: "welcome",
      title: "This is a real form, not a screenshot.",
      description: "Two questions · try your keyboard",
      buttonLabel: "Try it",
    },
    {
      id: "m_use",
      type: "single_choice",
      title: "What would you use beautiful forms for?",
      required: true,
      options: [
        { id: "m_events", label: "Event signups" },
        { id: "m_feedback", label: "Feedback" },
        { id: "m_hiring", label: "Hiring" },
      ],
    },
    {
      id: "m_rating",
      type: "rating",
      title: "How does this feel so far?",
      required: false,
      max: 5,
      icon: "star",
    },
    {
      id: "m_thanks",
      type: "thank_you",
      title: "That’s the whole idea.",
      description: "One question at a time — now imagine it in your brand.",
    },
  ],
  logic: [],
};
