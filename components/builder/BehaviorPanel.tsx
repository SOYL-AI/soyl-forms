"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { FormSettings } from "@/types/forms";
import { PLANS, type PlanCode } from "@/lib/plans";
import { Field, Input, Switch, Textarea } from "@/components/ui/input";

/** Form-wide behaviour: progress, auto-advance, limits, redirects, notifications. */
export function BehaviorPanel({
  settings,
  onSettingsPatch,
  plan,
}: {
  settings: FormSettings;
  onSettingsPatch: (p: Partial<FormSettings>) => void;
  plan: PlanCode;
}) {
  const notify = PLANS[plan].entitlements.emailNotifications;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Experience</p>
        <Switch
          checked={settings.showProgress ?? true}
          onChange={(v) => onSettingsPatch({ showProgress: v })}
          label="Show progress"
          description="A thin bar and “3 / 8” counter above each question."
        />
        <Switch
          checked={settings.autoAdvance ?? true}
          onChange={(v) => onSettingsPatch({ autoAdvance: v })}
          label="Auto-advance"
          description="Single-choice, yes/no and rating questions move on right after a pick."
        />
        <Switch
          checked={settings.allowMultipleSubmissions ?? true}
          onChange={(v) => onSettingsPatch({ allowMultipleSubmissions: v })}
          label="Allow repeat responses"
          description="Off: one response per device (soft check, not a hard identity gate)."
        />
        <Switch
          checked={settings.collectQueryParams ?? true}
          onChange={(v) => onSettingsPatch({ collectQueryParams: v })}
          label="Save URL parameters"
          description="?utm_source=… and similar are stored as hidden fields."
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Next button">
            <Input value={settings.buttonLabelNext ?? ""} placeholder="Next" maxLength={30} onChange={(e) => onSettingsPatch({ buttonLabelNext: e.target.value || undefined })} />
          </Field>
          <Field label="Submit button">
            <Input value={settings.buttonLabelSubmit ?? ""} placeholder="Submit" maxLength={30} onChange={(e) => onSettingsPatch({ buttonLabelSubmit: e.target.value || undefined })} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Quiz</p>
        <Switch
          checked={settings.quizMode ?? false}
          onChange={(v) => onSettingsPatch({ quizMode: v || undefined })}
          label="Make this a quiz"
          description="Set correct answers and points on each question."
        />
        {settings.quizMode && (
          <Switch
            checked={settings.showScore ?? true}
            onChange={(v) => onSettingsPatch({ showScore: v })}
            label="Show score at the end"
            description="Respondents see their score after submitting."
          />
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Limits & closing</p>
        <Field label="Response limit" hint="Blank = unlimited (your plan’s monthly cap still applies).">
          <Input
            type="number"
            min={1}
            value={settings.submissionLimit ?? ""}
            placeholder="Unlimited"
            onChange={(e) => onSettingsPatch({ submissionLimit: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="Close automatically at">
          <Input
            type="datetime-local"
            value={settings.closeAt ? settings.closeAt.slice(0, 16) : ""}
            onChange={(e) => onSettingsPatch({ closeAt: e.target.value === "" ? null : new Date(e.target.value).toISOString() })}
          />
        </Field>
        <Field label="Closed message" hint="Shown when the form is closed or full.">
          <Textarea
            value={settings.closedMessage ?? ""}
            placeholder="This form is no longer accepting responses."
            onChange={(e) => onSettingsPatch({ closedMessage: e.target.value || undefined })}
            rows={2}
            maxLength={500}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">After submit</p>
        <Field label="Redirect to" hint="Respondents go here 1–2 seconds after the thank-you screen. https only.">
          <Input
            value={settings.redirectUrl ?? ""}
            placeholder="https://yoursite.com/thanks"
            onChange={(e) => onSettingsPatch({ redirectUrl: e.target.value.trim() || null })}
          />
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              Email me each response
              {!notify && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink dark:text-accent">
                  <Lock className="h-3 w-3" /> Starter+
                </span>
              )}
            </span>
          }
          hint={
            notify ? (
              "Up to 5 addresses, comma separated."
            ) : (
              <>
                Notifications send on paid plans.{" "}
                <Link href="/billing" className="font-semibold underline underline-offset-2">
                  Upgrade
                </Link>
              </>
            )
          }
        >
          <Input
            value={(settings.notifyEmails ?? []).join(", ")}
            placeholder="you@company.com, team@company.com"
            onChange={(e) =>
              onSettingsPatch({
                notifyEmails: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 5),
              })
            }
          />
        </Field>
      </section>
    </div>
  );
}
