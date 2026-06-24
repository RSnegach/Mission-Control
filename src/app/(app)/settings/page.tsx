import { getPrimaryBusiness, getSettings } from "@/lib/data";
import { DEFAULT_FOLLOWUP_TEMPLATE, DEFAULT_ACK_TEMPLATE } from "@/lib/template";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { SettingsForm } from "@/components/SettingsForm";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Settings" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const settings = await getSettings(business.id);

  return (
    <>
      <PageHeader title="Settings" subtitle={`${business.name} · call handling`} />
      <SettingsForm
        action={saveSettings}
        businessName={business.name}
        enabled={settings?.sms_followup_enabled ?? true}
        template={settings?.sms_followup_template ?? DEFAULT_FOLLOWUP_TEMPLATE}
        defaultRoutePhone={settings?.default_route_phone ?? ""}
        ackEnabled={settings?.ack_enabled ?? true}
        ackTemplate={settings?.ack_template ?? DEFAULT_ACK_TEMPLATE}
      />
    </>
  );
}
