"use server";

import { revalidatePath } from "next/cache";
import { getPrimaryBusiness, updateSettings } from "@/lib/data";

/**
 * Save the missed-call follow-up settings. First mutation in the app: a form
 * server action that writes through the data layer and revalidates the page.
 */
export async function saveSettings(formData: FormData): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;

  const enabled = formData.get("sms_followup_enabled") === "on";
  const template = String(formData.get("sms_followup_template") ?? "").trim();
  const routePhone = String(formData.get("default_route_phone") ?? "").trim();
  const ackEnabled = formData.get("ack_enabled") === "on";
  const ackTemplate = String(formData.get("ack_template") ?? "").trim();

  await updateSettings(business.id, {
    sms_followup_enabled: enabled,
    sms_followup_template: template || null,
    default_route_phone: routePhone || null,
    ack_enabled: ackEnabled,
    ack_template: ackTemplate || null,
  });

  revalidatePath("/settings");
}
