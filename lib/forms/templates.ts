import type { FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { THEME_PRESETS } from "./themes";

/**
 * Starter templates. Each is a complete, valid FormSchemaV1 with a theme, so
 * "Use template" is one click away from a publishable form. Ids inside a
 * template are stable and namespaced (`t_<template>_<field>`); duplicates
 * across templates are fine because forms are independent documents.
 */

export type TemplateCategory =
  | "Events"
  | "Feedback"
  | "Hiring"
  | "Sales"
  | "Education"
  | "Research"
  | "Community"
  | "Operations";

export interface FormTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Rough completion time for respondents. */
  minutes: number;
  popular?: boolean;
  schema: FormSchemaV1;
  theme: FormTheme;
  settings?: FormSettings;
}

const preset = (id: string): FormTheme => {
  const p = THEME_PRESETS.find((t) => t.id === id);
  return p ? { ...p.theme } : {};
};

export const TEMPLATES: FormTemplate[] = [
  {
    id: "event-registration",
    name: "Event registration",
    category: "Events",
    description: "Collect attendee details, ticket type and dietary needs for a fest, meetup or conference.",
    minutes: 2,
    popular: true,
    theme: preset("marigold"),
    settings: { autoAdvance: true, showProgress: true },
    schema: {
      schemaVersion: 1,
      title: "Event registration",
      blocks: [
        { id: "t_evt_welcome", type: "welcome", title: "Grab your spot", description: "Registration takes about two minutes. We'll email your confirmation right away.", buttonLabel: "Register" },
        { id: "t_evt_name", type: "short_text", title: "What's your full name?", required: true, placeholder: "Priya Sharma" },
        { id: "t_evt_email", type: "email", title: "Where should we send your ticket?", required: true, placeholder: "you@example.com" },
        { id: "t_evt_phone", type: "phone", title: "Phone number", description: "Only for day-of updates.", required: false, placeholder: "+91 98765 43210" },
        { id: "t_evt_org", type: "short_text", title: "College or organisation", required: false, placeholder: "IIT Bombay" },
        {
          id: "t_evt_ticket", type: "single_choice", title: "Which pass do you want?", required: true,
          options: [
            { id: "t_evt_ticket_day", label: "Day pass" },
            { id: "t_evt_ticket_full", label: "Full event" },
            { id: "t_evt_ticket_team", label: "Team (4 people)" },
          ],
        },
        { id: "t_evt_team", type: "number", title: "How many people are on your team?", required: true, validation: { min: 2, max: 8 } },
        {
          id: "t_evt_diet", type: "multiple_choice", title: "Any dietary requirements?", required: false, allowOther: true,
          options: [
            { id: "t_evt_diet_veg", label: "Vegetarian" },
            { id: "t_evt_diet_jain", label: "Jain" },
            { id: "t_evt_diet_vegan", label: "Vegan" },
            { id: "t_evt_diet_none", label: "No restrictions" },
          ],
        },
        { id: "t_evt_consent", type: "legal", title: "One last thing", required: true, acceptLabel: "I agree to the event code of conduct", linkLabel: "Read the code of conduct" },
        { id: "t_evt_thanks", type: "thank_you", title: "You're registered!", description: "Check your inbox for the confirmation. See you there.", buttonLabel: "Add to calendar" },
      ],
      logic: [
        { id: "t_evt_r1", when: { questionId: "t_evt_ticket", operator: "not_equals", value: "t_evt_ticket_team" }, then: { action: "goto", blockId: "t_evt_diet" } },
      ],
    },
  },
  {
    id: "customer-feedback",
    name: "Customer feedback & NPS",
    category: "Feedback",
    description: "A short NPS survey with a follow-up that changes based on the score.",
    minutes: 2,
    popular: true,
    theme: preset("ocean"),
    schema: {
      schemaVersion: 1,
      title: "How are we doing?",
      blocks: [
        { id: "t_nps_welcome", type: "welcome", title: "Two minutes to make us better", description: "Your answers go straight to the team that builds the product.", buttonLabel: "Start" },
        { id: "t_nps_score", type: "opinion_scale", title: "How likely are you to recommend us to a friend or colleague?", required: true, min: 0, max: 10, minLabel: "Not likely", maxLabel: "Extremely likely" },
        { id: "t_nps_improve", type: "long_text", title: "What's the one thing we should fix first?", description: "Be blunt — it helps.", required: false, placeholder: "The thing that annoyed me most was…" },
        { id: "t_nps_love", type: "long_text", title: "What do you like most?", required: false, placeholder: "I keep coming back because…" },
        {
          id: "t_nps_aspects", type: "matrix", title: "Rate these", required: false,
          rows: [
            { id: "t_nps_row_quality", label: "Quality" },
            { id: "t_nps_row_support", label: "Support" },
            { id: "t_nps_row_value", label: "Value for money" },
          ],
          columns: [
            { id: "t_nps_col_1", label: "Poor" },
            { id: "t_nps_col_2", label: "Okay" },
            { id: "t_nps_col_3", label: "Good" },
            { id: "t_nps_col_4", label: "Excellent" },
          ],
        },
        { id: "t_nps_email", type: "email", title: "Can we follow up with you?", description: "Optional. We'll only write about your feedback.", required: false, placeholder: "you@example.com" },
        { id: "t_nps_thanks", type: "thank_you", title: "Thank you", description: "Every response is read by a person, not a dashboard." },
      ],
      logic: [
        { id: "t_nps_r_high", when: { questionId: "t_nps_score", operator: "greater_than", value: "8" }, then: { action: "goto", blockId: "t_nps_love" } },
        { id: "t_nps_r_low", when: { questionId: "t_nps_improve", operator: "answered" }, then: { action: "goto", blockId: "t_nps_aspects" } },
      ],
    },
  },
  {
    id: "job-application",
    name: "Job application",
    category: "Hiring",
    description: "Role, experience, portfolio and CV upload — everything a first screen needs.",
    minutes: 4,
    popular: true,
    theme: preset("slate"),
    schema: {
      schemaVersion: 1,
      title: "Apply to join us",
      blocks: [
        { id: "t_job_welcome", type: "welcome", title: "Let's start with the basics", description: "About four minutes. You'll need a CV or portfolio link handy.", buttonLabel: "Apply" },
        { id: "t_job_name", type: "short_text", title: "Your full name", required: true, placeholder: "Arjun Mehta" },
        { id: "t_job_email", type: "email", title: "Email address", required: true, placeholder: "you@example.com" },
        { id: "t_job_phone", type: "phone", title: "Phone number", required: true, placeholder: "+91 …" },
        {
          id: "t_job_role", type: "dropdown", title: "Which role are you applying for?", required: true,
          options: [
            { id: "t_job_role_fe", label: "Frontend engineer" },
            { id: "t_job_role_be", label: "Backend engineer" },
            { id: "t_job_role_design", label: "Product designer" },
            { id: "t_job_role_growth", label: "Growth marketer" },
            { id: "t_job_role_other", label: "Something else" },
          ],
        },
        { id: "t_job_years", type: "number", title: "Years of relevant experience", required: true, validation: { min: 0, max: 40 } },
        { id: "t_job_portfolio", type: "url", title: "Portfolio, GitHub or LinkedIn", required: false, placeholder: "https://" },
        { id: "t_job_cv", type: "file_upload", title: "Upload your CV", description: "PDF preferred, under 10 MB.", required: true, maxSizeMb: 10, allowedMimes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
        { id: "t_job_why", type: "long_text", title: "Why this role, why now?", description: "A few sentences is plenty.", required: true, validation: { maxLength: 1500 } },
        {
          id: "t_job_notice", type: "single_choice", title: "Notice period", required: true,
          options: [
            { id: "t_job_notice_now", label: "Available now" },
            { id: "t_job_notice_2w", label: "Up to 2 weeks" },
            { id: "t_job_notice_1m", label: "About a month" },
            { id: "t_job_notice_2m", label: "2 months or more" },
          ],
        },
        { id: "t_job_consent", type: "legal", title: "Before you submit", required: true, acceptLabel: "I consent to my details being stored for this hiring process", linkLabel: "Privacy policy" },
        { id: "t_job_thanks", type: "thank_you", title: "Application received", description: "We reply to every applicant within 7 working days." },
      ],
      logic: [],
    },
  },
  {
    id: "lead-capture",
    name: "Lead capture",
    category: "Sales",
    description: "Qualify inbound interest with company size, needs and budget, then book a call.",
    minutes: 1,
    popular: true,
    theme: preset("forest"),
    schema: {
      schemaVersion: 1,
      title: "Talk to us",
      blocks: [
        { id: "t_lead_welcome", type: "welcome", title: "Tell us a little about your team", description: "Five quick questions and we'll come back with a plan.", buttonLabel: "Let's go" },
        { id: "t_lead_name", type: "short_text", title: "What's your name?", required: true, placeholder: "First and last name" },
        { id: "t_lead_email", type: "email", title: "Work email", required: true, placeholder: "you@company.com" },
        { id: "t_lead_company", type: "short_text", title: "Company", required: true, placeholder: "Acme Pvt Ltd" },
        {
          id: "t_lead_size", type: "single_choice", title: "How big is your team?", required: true,
          options: [
            { id: "t_lead_size_1", label: "Just me" },
            { id: "t_lead_size_2", label: "2–10" },
            { id: "t_lead_size_3", label: "11–50" },
            { id: "t_lead_size_4", label: "51–200" },
            { id: "t_lead_size_5", label: "200+" },
          ],
        },
        {
          id: "t_lead_needs", type: "multiple_choice", title: "What are you hoping to solve?", required: true, allowOther: true,
          options: [
            { id: "t_lead_need_1", label: "Collect leads" },
            { id: "t_lead_need_2", label: "Customer feedback" },
            { id: "t_lead_need_3", label: "Event registrations" },
            { id: "t_lead_need_4", label: "Internal requests" },
          ],
        },
        {
          id: "t_lead_budget", type: "single_choice", title: "Monthly budget you have in mind", required: false,
          options: [
            { id: "t_lead_budget_1", label: "Under ₹5,000" },
            { id: "t_lead_budget_2", label: "₹5,000 – ₹25,000" },
            { id: "t_lead_budget_3", label: "₹25,000 – ₹1 lakh" },
            { id: "t_lead_budget_4", label: "Over ₹1 lakh" },
          ],
        },
        { id: "t_lead_thanks", type: "thank_you", title: "Thanks — we'll be in touch within a day", description: "Want to skip the wait? Book a slot now.", buttonLabel: "Book a call" },
      ],
      logic: [],
    },
  },
  {
    id: "rsvp",
    name: "RSVP",
    category: "Events",
    description: "Yes/no attendance with guest count and meal choice only for those coming.",
    minutes: 1,
    theme: preset("rose"),
    schema: {
      schemaVersion: 1,
      title: "Will you join us?",
      blocks: [
        { id: "t_rsvp_welcome", type: "welcome", title: "You're invited", description: "Let us know by the 20th so we can plan the seating.", buttonLabel: "RSVP" },
        { id: "t_rsvp_name", type: "short_text", title: "Your name", required: true },
        { id: "t_rsvp_attending", type: "yes_no", title: "Will you be attending?", required: true },
        { id: "t_rsvp_guests", type: "number", title: "How many guests are you bringing, including yourself?", required: true, validation: { min: 1, max: 6 } },
        {
          id: "t_rsvp_meal", type: "single_choice", title: "Meal preference", required: true,
          options: [
            { id: "t_rsvp_meal_veg", label: "Vegetarian" },
            { id: "t_rsvp_meal_nonveg", label: "Non-vegetarian" },
            { id: "t_rsvp_meal_vegan", label: "Vegan" },
          ],
        },
        { id: "t_rsvp_song", type: "short_text", title: "One song that has to be played", required: false, placeholder: "Artist — Title" },
        { id: "t_rsvp_thanks", type: "thank_you", title: "See you there!", description: "We'll send directions a week before." },
        { id: "t_rsvp_sorry", type: "thank_you", title: "We'll miss you", description: "Thanks for letting us know — we'll save you a slice of cake." },
      ],
      logic: [
        { id: "t_rsvp_r_no", when: { questionId: "t_rsvp_attending", operator: "equals", value: "no" }, then: { action: "goto", blockId: "t_rsvp_sorry" } },
      ],
    },
  },
  {
    id: "course-feedback",
    name: "Course feedback",
    category: "Education",
    description: "End-of-course evaluation: content, pace and instructor in a compact grid.",
    minutes: 2,
    theme: preset("paper"),
    schema: {
      schemaVersion: 1,
      title: "Course feedback",
      blocks: [
        { id: "t_course_welcome", type: "welcome", title: "Help us improve the next batch", description: "Anonymous unless you choose to share your name.", buttonLabel: "Begin" },
        {
          id: "t_course_grid", type: "matrix", title: "How would you rate the following?", required: true,
          rows: [
            { id: "t_course_row_content", label: "Content quality" },
            { id: "t_course_row_pace", label: "Pace" },
            { id: "t_course_row_instructor", label: "Instructor clarity" },
            { id: "t_course_row_materials", label: "Materials & resources" },
          ],
          columns: [
            { id: "t_course_col_1", label: "Poor" },
            { id: "t_course_col_2", label: "Fair" },
            { id: "t_course_col_3", label: "Good" },
            { id: "t_course_col_4", label: "Great" },
          ],
        },
        { id: "t_course_rating", type: "rating", title: "Overall, how was the course?", required: true, max: 5, icon: "star" },
        { id: "t_course_useful", type: "long_text", title: "What was the most useful part?", required: false },
        { id: "t_course_change", type: "long_text", title: "What would you change?", required: false },
        { id: "t_course_recommend", type: "yes_no", title: "Would you recommend this course to a friend?", required: true },
        { id: "t_course_thanks", type: "thank_you", title: "Thank you", description: "Your feedback shapes the next cohort." },
      ],
      logic: [],
    },
  },
  {
    id: "contact",
    name: "Contact us",
    category: "Operations",
    description: "A friendlier alternative to the classic contact form, routed by topic.",
    minutes: 1,
    theme: preset("slate"),
    schema: {
      schemaVersion: 1,
      title: "Contact us",
      blocks: [
        { id: "t_contact_name", type: "short_text", title: "Hi! What should we call you?", required: true, placeholder: "Your name" },
        { id: "t_contact_email", type: "email", title: "Where can we reply?", required: true, placeholder: "you@example.com" },
        {
          id: "t_contact_topic", type: "dropdown", title: "What is this about?", required: true,
          options: [
            { id: "t_contact_topic_sales", label: "Sales & pricing" },
            { id: "t_contact_topic_support", label: "Support" },
            { id: "t_contact_topic_partner", label: "Partnerships" },
            { id: "t_contact_topic_other", label: "Something else" },
          ],
        },
        { id: "t_contact_message", type: "long_text", title: "Tell us more", required: true, placeholder: "The more detail, the faster we can help." },
        { id: "t_contact_thanks", type: "thank_you", title: "Got it — we'll reply within one working day." },
      ],
      logic: [],
    },
  },
  {
    id: "research-survey",
    name: "User research survey",
    category: "Research",
    description: "Segment respondents, then measure attitudes with a Likert grid and open questions.",
    minutes: 3,
    theme: preset("terracotta"),
    schema: {
      schemaVersion: 1,
      title: "User research survey",
      blocks: [
        { id: "t_res_welcome", type: "welcome", title: "Help shape what we build next", description: "About three minutes. No right answers.", buttonLabel: "Start" },
        {
          id: "t_res_age", type: "single_choice", title: "Which age group are you in?", required: true,
          options: [
            { id: "t_res_age_1", label: "Under 18" },
            { id: "t_res_age_2", label: "18–24" },
            { id: "t_res_age_3", label: "25–34" },
            { id: "t_res_age_4", label: "35–44" },
            { id: "t_res_age_5", label: "45+" },
          ],
        },
        {
          id: "t_res_freq", type: "single_choice", title: "How often do you use products like ours?", required: true,
          options: [
            { id: "t_res_freq_1", label: "Daily" },
            { id: "t_res_freq_2", label: "A few times a week" },
            { id: "t_res_freq_3", label: "A few times a month" },
            { id: "t_res_freq_4", label: "Rarely" },
          ],
        },
        {
          id: "t_res_likert", type: "matrix", title: "How much do you agree?", required: true,
          rows: [
            { id: "t_res_row_1", label: "It saves me time" },
            { id: "t_res_row_2", label: "It's easy to learn" },
            { id: "t_res_row_3", label: "It's worth the price" },
          ],
          columns: [
            { id: "t_res_col_1", label: "Disagree" },
            { id: "t_res_col_2", label: "Neutral" },
            { id: "t_res_col_3", label: "Agree" },
            { id: "t_res_col_4", label: "Strongly agree" },
          ],
        },
        { id: "t_res_open", type: "long_text", title: "If you could change one thing, what would it be?", required: false },
        { id: "t_res_interview", type: "yes_no", title: "Would you be open to a 20-minute interview?", description: "We'll send a ₹500 voucher as a thank-you.", required: true },
        { id: "t_res_email", type: "email", title: "Great — what's the best email to reach you?", required: true },
        { id: "t_res_thanks", type: "thank_you", title: "Thank you", description: "Your input goes straight into our roadmap." },
      ],
      logic: [
        { id: "t_res_r_no", when: { questionId: "t_res_interview", operator: "equals", value: "no" }, then: { action: "goto", blockId: "t_res_thanks" } },
      ],
    },
  },
  {
    id: "order-form",
    name: "Order & pickup",
    category: "Sales",
    description: "Take simple orders with quantity, pickup date and time — great for home bakers and cafés.",
    minutes: 2,
    theme: preset("terracotta"),
    schema: {
      schemaVersion: 1,
      title: "Place an order",
      blocks: [
        { id: "t_ord_welcome", type: "welcome", title: "Order for pickup", description: "Orders close at 6pm for next-day pickup.", buttonLabel: "Order now" },
        { id: "t_ord_name", type: "short_text", title: "Name for the order", required: true },
        { id: "t_ord_phone", type: "phone", title: "Phone number", description: "We'll message you when it's ready.", required: true },
        {
          id: "t_ord_item", type: "single_choice", title: "What would you like?", required: true,
          options: [
            { id: "t_ord_item_1", label: "Classic chocolate cake (1 kg)" },
            { id: "t_ord_item_2", label: "Lemon loaf" },
            { id: "t_ord_item_3", label: "Box of 6 cupcakes" },
            { id: "t_ord_item_4", label: "Sourdough loaf" },
          ],
        },
        { id: "t_ord_qty", type: "number", title: "How many?", required: true, validation: { min: 1, max: 20 } },
        { id: "t_ord_date", type: "date", title: "Pickup date", required: true },
        { id: "t_ord_time", type: "time", title: "Pickup time", description: "We're open 9am – 7pm.", required: true },
        { id: "t_ord_notes", type: "long_text", title: "Anything else? Allergies, messages on the cake…", required: false },
        { id: "t_ord_thanks", type: "thank_you", title: "Order received!", description: "We'll confirm on WhatsApp shortly." },
      ],
      logic: [],
    },
  },
  {
    id: "employee-pulse",
    name: "Employee pulse",
    category: "Community",
    description: "A monthly, anonymous check-in on workload, clarity and morale.",
    minutes: 2,
    theme: preset("midnight"),
    settings: { allowMultipleSubmissions: false },
    schema: {
      schemaVersion: 1,
      title: "Monthly pulse",
      blocks: [
        { id: "t_pulse_welcome", type: "welcome", title: "How was this month?", description: "Anonymous. Two minutes. Read by leadership every month.", buttonLabel: "Start" },
        { id: "t_pulse_workload", type: "opinion_scale", title: "My workload this month was manageable", required: true, min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
        { id: "t_pulse_clarity", type: "opinion_scale", title: "I understand what's expected of me", required: true, min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
        { id: "t_pulse_morale", type: "rating", title: "Overall, how are you feeling about work?", required: true, max: 5, icon: "heart" },
        {
          id: "t_pulse_blockers", type: "multiple_choice", title: "What got in your way?", required: false, allowOther: true,
          options: [
            { id: "t_pulse_b_meetings", label: "Too many meetings" },
            { id: "t_pulse_b_tools", label: "Tools & access" },
            { id: "t_pulse_b_priorities", label: "Shifting priorities" },
            { id: "t_pulse_b_none", label: "Nothing major" },
          ],
        },
        { id: "t_pulse_open", type: "long_text", title: "Anything leadership should hear?", required: false },
        { id: "t_pulse_thanks", type: "thank_you", title: "Thank you", description: "Results are shared with everyone at the next all-hands." },
      ],
      logic: [],
    },
  },
  {
    id: "restaurant-feedback",
    name: "Restaurant feedback",
    category: "Feedback",
    description: "Table-side QR feedback on food, service and ambience.",
    minutes: 1,
    theme: preset("rose"),
    schema: {
      schemaVersion: 1,
      title: "How was your meal?",
      blocks: [
        { id: "t_rest_rating", type: "rating", title: "How was your visit today?", required: true, max: 5, icon: "heart" },
        {
          id: "t_rest_grid", type: "matrix", title: "A little more detail", required: false,
          rows: [
            { id: "t_rest_row_food", label: "Food" },
            { id: "t_rest_row_service", label: "Service" },
            { id: "t_rest_row_ambience", label: "Ambience" },
          ],
          columns: [
            { id: "t_rest_col_1", label: "Meh" },
            { id: "t_rest_col_2", label: "Good" },
            { id: "t_rest_col_3", label: "Loved it" },
          ],
        },
        { id: "t_rest_return", type: "yes_no", title: "Would you come back?", required: true },
        { id: "t_rest_open", type: "long_text", title: "Anything you'd tell the chef?", required: false },
        { id: "t_rest_thanks", type: "thank_you", title: "Thank you!", description: "Show this screen for 10% off your next visit." },
      ],
      logic: [],
    },
  },
  {
    id: "waitlist",
    name: "Waitlist signup",
    category: "Community",
    description: "Capture early interest with a light segmentation question.",
    minutes: 1,
    theme: preset("marigold"),
    schema: {
      schemaVersion: 1,
      title: "Join the waitlist",
      blocks: [
        { id: "t_wait_email", type: "email", title: "Drop your email and we'll let you in early", required: true, placeholder: "you@example.com" },
        { id: "t_wait_name", type: "short_text", title: "What should we call you?", required: false, placeholder: "First name" },
        {
          id: "t_wait_role", type: "single_choice", title: "Which describes you best?", required: true,
          options: [
            { id: "t_wait_role_founder", label: "Founder" },
            { id: "t_wait_role_marketer", label: "Marketer" },
            { id: "t_wait_role_dev", label: "Developer" },
            { id: "t_wait_role_student", label: "Student" },
          ],
        },
        { id: "t_wait_thanks", type: "thank_you", title: "You're on the list", description: "We'll email you the moment your invite is ready.", buttonLabel: "Follow updates" },
      ],
      logic: [],
    },
  },
  {
    id: "class-quiz",
    name: "Class quiz",
    category: "Education",
    description: "A graded quiz with instant scores — correct answers stay hidden from students.",
    minutes: 3,
    popular: true,
    theme: preset("ocean"),
    settings: { quizMode: true, showScore: true, autoAdvance: false },
    schema: {
      schemaVersion: 1,
      title: "Science quiz",
      blocks: [
        { id: "t_quiz_welcome", type: "welcome", title: "Quick science quiz", description: "Five questions. Your score appears at the end.", buttonLabel: "Begin" },
        { id: "t_quiz_name", type: "short_text", title: "What's your name?", required: true, placeholder: "Full name" },
        {
          id: "t_quiz_planet", type: "single_choice", title: "Good luck, {{t_quiz_name}}! Which planet is closest to the Sun?", required: true,
          options: [
            { id: "t_quiz_planet_mercury", label: "Mercury" },
            { id: "t_quiz_planet_venus", label: "Venus" },
            { id: "t_quiz_planet_mars", label: "Mars" },
            { id: "t_quiz_planet_earth", label: "Earth" },
          ],
          quiz: { correct: ["t_quiz_planet_mercury"], points: 1 },
        },
        {
          id: "t_quiz_gases", type: "multiple_choice", title: "Which of these are noble gases?", description: "Pick all that apply.", required: true,
          options: [
            { id: "t_quiz_gas_helium", label: "Helium" },
            { id: "t_quiz_gas_oxygen", label: "Oxygen" },
            { id: "t_quiz_gas_neon", label: "Neon" },
            { id: "t_quiz_gas_nitrogen", label: "Nitrogen" },
          ],
          quiz: { correct: ["t_quiz_gas_helium", "t_quiz_gas_neon"], points: 2 },
        },
        { id: "t_quiz_water", type: "yes_no", title: "Does water boil at 100 °C at sea level?", required: true, quiz: { correct: ["yes"], points: 1 } },
        { id: "t_quiz_symbol", type: "short_text", title: "What is the chemical symbol for gold?", required: true, placeholder: "Two letters", quiz: { correct: ["Au"], points: 1 } },
        { id: "t_quiz_thanks", type: "thank_you", title: "Well done, {{t_quiz_name}}!", description: "Your answers have been submitted." },
      ],
      logic: [],
    },
  },
  {
    id: "team-availability",
    name: "Team availability",
    category: "Operations",
    description: "Collect shift availability in a checkbox grid and rank preferred roles.",
    minutes: 2,
    theme: preset("slate"),
    schema: {
      schemaVersion: 1,
      title: "Availability",
      blocks: [
        { id: "t_avail_name", type: "short_text", title: "Your name", required: true },
        {
          id: "t_avail_grid", type: "matrix", title: "When can you work next week?", description: "Tick every slot that works.", required: true, multiple: true,
          rows: [
            { id: "t_avail_mon", label: "Monday" },
            { id: "t_avail_tue", label: "Tuesday" },
            { id: "t_avail_wed", label: "Wednesday" },
            { id: "t_avail_thu", label: "Thursday" },
            { id: "t_avail_fri", label: "Friday" },
          ],
          columns: [
            { id: "t_avail_am", label: "Morning" },
            { id: "t_avail_pm", label: "Afternoon" },
            { id: "t_avail_eve", label: "Evening" },
          ],
        },
        {
          id: "t_avail_roles", type: "ranking", title: "Rank the roles you'd like, {{t_avail_name}}", required: true,
          options: [
            { id: "t_avail_role_front", label: "Front desk" },
            { id: "t_avail_role_kitchen", label: "Kitchen" },
            { id: "t_avail_role_delivery", label: "Delivery" },
          ],
        },
        { id: "t_avail_thanks", type: "thank_you", title: "Thanks — the rota goes out on Friday." },
      ],
      logic: [],
    },
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Events",
  "Feedback",
  "Hiring",
  "Sales",
  "Education",
  "Research",
  "Community",
  "Operations",
];

export function getTemplate(id: string): FormTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
