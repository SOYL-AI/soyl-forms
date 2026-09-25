import { getPlatformFlags } from "@/lib/platform";
import { requireAdmin } from "@/lib/admin";
import { PLANS, PLAN_ORDER, AI_CREDIT_PACKS, formatINR } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatBytes } from "@/lib/utils";
import { SettingsForm } from "./SettingsForm";

export default async function AdminSettingsPage() {
  const [flags, gate] = await Promise.all([getPlatformFlags(), requireAdmin()]);
  const canEdit = gate.ok && gate.role === "super_admin";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Platform settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Kill switches for risky surfaces. Plan definitions ship in code (below) so a typo here can never change pricing.</p>
      </div>
      <SettingsForm initial={flags} canEdit={canEdit} />

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Plan definitions (read-only, from lib/plans.ts)</p>
        <div className="mt-3 border-t border-line">
          <Table className="border-0">
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Price</Th>
                <Th>Forms</Th>
                <Th>Responses/mo</Th>
                <Th>Storage</Th>
                <Th>AI credits/mo</Th>
                <Th>Brand kits</Th>
                <Th>Emails/mo</Th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ORDER.map((c) => {
                const p = PLANS[c];
                return (
                  <tr key={c}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td>
                      {formatINR(p.monthlyPaise)}/mo · {formatINR(p.yearlyPaise)}/yr
                    </Td>
                    <Td>{p.entitlements.maxActiveForms}</Td>
                    <Td>{p.entitlements.monthlySubmissions.toLocaleString("en-IN")}</Td>
                    <Td>{formatBytes(p.entitlements.storageBytes)}</Td>
                    <Td>{p.entitlements.aiCreditsMonthly}</Td>
                    <Td>{p.entitlements.maxBrandKits}</Td>
                    <Td>{p.entitlements.monthlyNotificationEmails}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="px-5 py-4 text-xs text-ink-faint">
          Credit packs: {AI_CREDIT_PACKS.map((p) => `${p.credits} for ${formatINR(p.paise)}`).join(" · ")}. Razorpay plan ids map from env (RAZORPAY_PLAN_*).
        </p>
      </Card>
    </div>
  );
}
