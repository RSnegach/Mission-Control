import { getPrimaryBusiness, getSettings } from "@/lib/data";
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
        template={settings?.sms_followup_template ?? ""}
        defaultRoutePhone={settings?.default_route_phone ?? ""}
      />
    </>
  );
}
