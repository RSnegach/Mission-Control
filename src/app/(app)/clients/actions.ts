"use server";

import { revalidatePath } from "next/cache";
import { getPrimaryBusiness, updateContactName } from "@/lib/data";

/**
 * Set or clear a contact's display name. Persists to the single contacts row, so
 * every surface that resolves the contact by id (Clients, profile, Messages,
 * Requests, Calls) reflects it. Empty input clears back to unnamed.
 */
export async function renameContact(contactId: string, name: string): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;

  const trimmed = name.trim().slice(0, 80);
  await updateContactName(business.id, contactId, trimmed || null);

  revalidatePath("/clients");
  revalidatePath("/clients/[id]", "page");
  revalidatePath("/messages");
}
