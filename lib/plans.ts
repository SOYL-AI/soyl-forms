/**
 * Centralized plan entitlements — the single source of truth for limits.
 * Server enforcement must read from here; never scatter literals like
 * `2`, `250`, or `5000` through the codebase.
 */

export type PlanCode = "free" | "starter" | "pro";
export type BillingInterval = "monthly" | "yearly";

export interface Entitlements {
  maxActiveForms: number;
  monthlySubmissions: number;
  storageBytes: number;
  removeBranding: boolean;
  /** Custom colors, logo, brand kits on published forms. */
  customThemes: boolean;
  advancedLogic: boolean;
  maxWebhooksPerForm: number;
  analyticsTier: "basic" | "advanced";
  /** Days of form version history retained. */
  versionHistoryDays: number;
  /** AI credits granted every calendar month (drafts + brand extraction). */
  aiCreditsMonthly: number;
  /** Saved brand kits per workspace. */
  maxBrandKits: number;
  /** Owner email notifications on new responses. */
  emailNotifications: boolean;
  /** Notification emails per month (0 = feature off). */
  monthlyNotificationEmails: number;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  monthlyPaise: number;
  yearlyPaise: number;
  tagline: string;
  /** Who this plan is for — used on pricing surfaces. */
  audience: string;
  entitlements: Entitlements;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: "free",
    name: "Free",
    monthlyPaise: 0,
    yearlyPaise: 0,
    tagline: "For trying things out and personal use.",
    audience: "Students, side projects, one-off events",
    entitlements: {
      maxActiveForms: 2,
      monthlySubmissions: 250,
      storageBytes: 25 * MB,
      removeBranding: false,
      customThemes: false,
      advancedLogic: false,
      maxWebhooksPerForm: 1,
      analyticsTier: "basic",
      versionHistoryDays: 7,
      aiCreditsMonthly: 10,
      maxBrandKits: 1,
      emailNotifications: false,
      monthlyNotificationEmails: 0,
    },
  },
  starter: {
    code: "starter",
    name: "Starter",
    monthlyPaise: 19900,
    yearlyPaise: 199000,
    tagline: "For freelancers and small teams getting serious.",
    audience: "Freelancers, small businesses, creators",
    entitlements: {
      maxActiveForms: 15,
      monthlySubmissions: 5000,
      storageBytes: 1 * GB,
      removeBranding: true,
      customThemes: true,
      advancedLogic: true,
      maxWebhooksPerForm: 5,
      analyticsTier: "basic",
      versionHistoryDays: 30,
      aiCreditsMonthly: 40,
      maxBrandKits: 3,
      emailNotifications: true,
      monthlyNotificationEmails: 1000,
    },
  },
  pro: {
    code: "pro",
    name: "Pro",
    monthlyPaise: 49900,
    yearlyPaise: 499000,
    tagline: "For high-volume forms and deeper insight.",
    audience: "Agencies, growing companies, multiple brands",
    entitlements: {
      maxActiveForms: 100,
      monthlySubmissions: 25000,
      storageBytes: 10 * GB,
      removeBranding: true,
      customThemes: true,
      advancedLogic: true,
      maxWebhooksPerForm: 20,
      analyticsTier: "advanced",
      versionHistoryDays: 90,
      aiCreditsMonthly: 150,
      maxBrandKits: 10,
      emailNotifications: true,
      monthlyNotificationEmails: 5000,
    },
  },
};

export const PLAN_ORDER: PlanCode[] = ["free", "starter", "pro"];

export function isPlanCode(v: unknown): v is PlanCode {
  return v === "free" || v === "starter" || v === "pro";
}

export interface CreditPack {
  id: string;
  credits: number;
  paise: number;
  label: string;
}

/** One-time AI credit top-ups (Razorpay Orders, not subscriptions). */
export const AI_CREDIT_PACKS: CreditPack[] = [
  { id: "pack-50", credits: 50, paise: 4900, label: "Starter pack" },
  { id: "pack-200", credits: 200, paise: 14900, label: "Popular pack" },
  { id: "pack-1000", credits: 1000, paise: 49900, label: "Power pack" },
];

/** Credits burned per AI-generated form draft. */
export const AI_COST_PER_DRAFT = 1;
/** Credits burned per brand extraction (reads PDFs/websites; heavier prompt). */
export const AI_COST_PER_BRAND_EXTRACTION = 2;
/** Free credits granted every calendar month, per workspace (free plan). */
export const AI_FREE_MONTHLY_CREDITS = PLANS.free.entitlements.aiCreditsMonthly;
/** Welcome bonus on workspace creation. */
export const AI_WELCOME_CREDITS = 10;

/** Format a paise amount as an INR string, e.g. 19900 -> "₹199". */
export function formatINR(paise: number): string {
  if (paise === 0) return "₹0";
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Monthly-equivalent price when billed yearly, e.g. ₹1,990/yr → ₹166/mo. */
export function yearlyPerMonthPaise(plan: PlanDefinition): number {
  return Math.round(plan.yearlyPaise / 12);
}

export function yearlySavingsPct(plan: PlanDefinition): number {
  if (plan.monthlyPaise === 0) return 0;
  return Math.round((1 - plan.yearlyPaise / (plan.monthlyPaise * 12)) * 100);
}

export interface PublishCheck {
  ok: boolean;
  reason?: string;
}

/** Can this workspace publish (or keep active) one more form? */
export function canPublishForm(args: {
  plan: PlanCode;
  activeForms: number;
  /** True when re-publishing an already-active form (does not consume quota). */
  republishingActive?: boolean;
}): PublishCheck {
  if (args.republishingActive) return { ok: true };
  const limit = PLANS[args.plan].entitlements.maxActiveForms;
  if (args.activeForms >= limit) {
    return {
      ok: false,
      reason: `Your ${PLANS[args.plan].name} plan allows ${limit} active forms. Upgrade to publish more.`,
    };
  }
  return { ok: true };
}

/** Can this workspace accept one more completed submission this month? */
export function canAcceptSubmission(args: {
  plan: PlanCode;
  monthlyCount: number;
}): PublishCheck {
  const limit = PLANS[args.plan].entitlements.monthlySubmissions;
  if (args.monthlyCount >= limit) {
    return {
      ok: false,
      reason: `Monthly response limit reached (${limit.toLocaleString("en-IN")} on ${PLANS[args.plan].name}).`,
    };
  }
  return { ok: true };
}

/** Would this upload fit inside the workspace storage quota? */
export function canUploadFile(args: {
  plan: PlanCode;
  storageUsedBytes: number;
  fileBytes: number;
}): PublishCheck {
  const limit = PLANS[args.plan].entitlements.storageBytes;
  if (args.storageUsedBytes + args.fileBytes > limit) {
    return {
      ok: false,
      reason: `Storage limit reached for the ${PLANS[args.plan].name} plan.`,
    };
  }
  return { ok: true };
}

/** Can this workspace save another brand kit? */
export function canCreateBrandKit(args: { plan: PlanCode; existing: number }): PublishCheck {
  const limit = PLANS[args.plan].entitlements.maxBrandKits;
  if (args.existing >= limit) {
    return {
      ok: false,
      reason: `Your ${PLANS[args.plan].name} plan allows ${limit} brand kit${limit === 1 ? "" : "s"}. Upgrade for more.`,
    };
  }
  return { ok: true };
}
