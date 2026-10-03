"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { Block, FormSettings, FormTranslation } from "@/types/forms";
import { PLANS, type PlanCode } from "@/lib/plans";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { TranslationsPanel } from "./TranslationsPanel";

/** Form-wide behaviour: progress, auto-advance, limits, redirects, notifications. */
export function BehaviorPanel({
  settings,
  onSettingsPatch,
  plan,
  blocks,
  locales,
  translations,
  onLocalesChange,
}: {
  settings: FormSettings;
  onSettingsPatch: (p: Partial<FormSettings>) => void;
  plan: PlanCode;
  /** All form blocks: used to list email questions for the autoresponder. */
  blocks?: Block[];
  locales: string[];
  translations: Record<string, FormTranslation>;
  onLocalesChange: (locales: string[], translations: Record<string, FormTranslation>) => void;
}) {
  const notify = PLANS[plan].entitlements.emailNotifications;
  const emailQuestions = (blocks ?? []).filter((b) => b.type === "email");
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Experience</p>
        <Switch
          checked={settings.showProgress ?? true}
          onChange={(v) => onSettingsPatch({ showProgress: v })}
          label="Show progress"
          description="Show respondents how far along they are."
        />
        <Switch
          checked={settings.autoAdvance ?? true}
          onChange={(v) => onSettingsPatch({ autoAdvance: v })}
          label="Auto-advance"
          description="Move to the next question as soon as an option is picked."
        />
        <Switch
          checked={settings.allowMultipleSubmissions ?? true}
          onChange={(v) => onSettingsPatch({ allowMultipleSubmissions: v })}
          label="Allow repeat responses"
          description="When off, each device can respond once."
        />
        <Switch
          checked={settings.collectQueryParams ?? true}
          onChange={(v) => onSettingsPatch({ collectQueryParams: v })}
          label="Save URL parameters"
          description="Save tracking details such as utm_source from the form link."
        />
        <Switch
          checked={settings.prefillEnabled ?? true}
          onChange={(v) => onSettingsPatch({ prefillEnabled: v })}
          label="Prefill from URL"
          description="Fill matching questions from link parameters, e.g. ?email=a@b.com."
        />
        <Field label="Hidden fields" hint="Comma-separated keys stored with each response, e.g. name, cohort. Use ?name=... in the link.">
          <Input
            value={(settings.hiddenFields ?? []).join(", ")}
            placeholder="name, cohort"
            onChange={(e) =>
              onSettingsPatch({
                hiddenFields: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => /^[A-Za-z0-9_.-]{1,64}$/.test(k))
                  .slice(0, 20),
              })
            }
          />
        </Field>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Languages</p>
        <TranslationsPanel
          blocks={blocks ?? []}
          locales={locales}
          translations={translations}
          onChange={onLocalesChange}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Limits & closing</p>
        <Field label="Response limit" hint="Leave blank for no limit.">
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
        <Field label="Redirect to" hint="Send respondents to this page after they submit.">
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
                <Link href="/billing" className="native-hide font-semibold underline underline-offset-2">
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
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              Respondent confirmation email
              {!notify && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink dark:text-accent">
                  <Lock className="h-3 w-3" /> Starter+
                </span>
              )}
            </span>
          }
          hint="Sent to the respondent after each response, with a copy of their answers."
        >
          <Switch
            checked={settings.responderEnabled ?? false}
            onChange={(v) => onSettingsPatch({ responderEnabled: v || undefined })}
            label="Send confirmation email"
            description="Uses the first answered email question as the recipient."
          />
        </Field>
        {settings.responderEnabled && (
          <>
            {emailQuestions.length > 0 && (
              <Field label="Send to answers from">
                <Select
                  value={settings.responderQuestionId ?? ""}
                  onChange={(e) => onSettingsPatch({ responderQuestionId: e.target.value || undefined })}
                >
                  <option value="">First answered email question</option>
                  {emailQuestions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Subject" hint="{{form_title}} is replaced with the form name.">
              <Input
                value={settings.responderSubject ?? ""}
                placeholder="Thanks for your response"
                maxLength={200}
                onChange={(e) => onSettingsPatch({ responderSubject: e.target.value || undefined })}
              />
            </Field>
            <Field label="Message">
              <Textarea
                value={settings.responderMessage ?? ""}
                placeholder="We received your response and will be in touch soon."
                rows={3}
                maxLength={2000}
                onChange={(e) => onSettingsPatch({ responderMessage: e.target.value || undefined })}
              />
            </Field>
          </>
        )}
      </section>
    </div>
  );
}
