"use server";

import { revalidatePath } from "next/cache";
import {
  getPrimaryBusiness,
  getBusinessFromNumber,
  updateRequest,
  createRequest,
  createContact,
  createActivity,
  createTag,
  addTagToContact,
  removeTagFromContact,
  createTask,
  updateTask,
} from "@/lib/data";
import { sendSmsToContact } from "@/lib/messaging";
import type { RequestPatch } from "@/lib/backend";

/**
 * Operability mutations. Each resolves the active business, writes through the
 * data facade (mock/sqlite/supabase), records an activity entry where it aids the
 * timeline, and revalidates the affected pages. SMS sends ride the same Twilio
 * gate as the follow-up (real send only outside mock mode).
 */

function revalidateOps() {
  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath("/clients");
  revalidatePath("/messages");
  revalidatePath("/tasks");
}

// --- Messages ---
export async function sendManualMessage(contactId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const business = await getPrimaryBusiness();
  if (!business) return;
  const from = await getBusinessFromNumber(business.id);
  if (!from) return;
  await sendSmsToContact(business, contactId, from, text);
  await createActivity({ businessId: business.id, contactId, kind: "message_sent", body: text, createdBy: "owner" });
  revalidatePath("/messages");
  revalidatePath("/clients");
}

// --- Requests ---
export async function changeRequest(requestId: string, patch: RequestPatch): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  const updated = await updateRequest(business.id, requestId, patch);
  if (updated) {
    const parts: string[] = [];
    if (patch.status) parts.push(`status -> ${patch.status}`);
    if (patch.priority) parts.push(`priority -> ${patch.priority}`);
    if (patch.scheduled_for) parts.push(`scheduled for ${patch.scheduled_for}`);
    if (parts.length) {
      await createActivity({
        businessId: business.id,
        requestId,
        contactId: updated.contact_id,
        kind: "status_change",
        body: parts.join(", "),
        createdBy: "owner",
      });
    }
  }
  revalidateOps();
}

export async function addRequest(params: {
  contactId: string | null;
  title: string;
  priority?: string;
  dueAt?: string | null;
  description?: string | null;
}): Promise<void> {
  const title = params.title.trim();
  if (!title) return;
  const business = await getPrimaryBusiness();
  if (!business) return;
  const req = await createRequest({
    businessId: business.id,
    contactId: params.contactId,
    title,
    priority: params.priority,
    dueAt: params.dueAt ?? null,
    description: params.description ?? null,
    source: "manual",
  });
  await createActivity({ businessId: business.id, requestId: req.id, contactId: req.contact_id, kind: "created", body: `Request created: ${title}`, createdBy: "owner" });
  revalidateOps();
}

export async function scheduleCallback(requestId: string, scheduledForIso: string): Promise<void> {
  await changeRequest(requestId, { scheduled_for: scheduledForIso });
}

// --- Bulk ---
export async function bulkUpdateRequestStatus(requestIds: string[], status: string): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  for (const id of requestIds) {
    await updateRequest(business.id, id, { status });
  }
  revalidateOps();
}

export async function bulkMessageContacts(contactIds: string[], body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const business = await getPrimaryBusiness();
  if (!business) return;
  const from = await getBusinessFromNumber(business.id);
  if (!from) return;
  for (const cid of contactIds) {
    await sendSmsToContact(business, cid, from, text);
    await createActivity({ businessId: business.id, contactId: cid, kind: "message_sent", body: text, createdBy: "owner" });
  }
  revalidatePath("/messages");
  revalidatePath("/clients");
}

// --- Contacts ---
export async function addContact(params: { name?: string; phone?: string; email?: string }): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  if (!params.name?.trim() && !params.phone?.trim()) return;
  await createContact({ businessId: business.id, name: params.name ?? null, phone: params.phone ?? null, email: params.email ?? null });
  revalidatePath("/clients");
}

// --- Notes ---
export async function addNote(target: { contactId?: string; requestId?: string }, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const business = await getPrimaryBusiness();
  if (!business) return;
  await createActivity({
    businessId: business.id,
    contactId: target.contactId ?? null,
    requestId: target.requestId ?? null,
    kind: "note",
    body: text,
    createdBy: "owner",
  });
  revalidatePath("/clients");
  revalidatePath("/requests");
}

// --- Tags ---
export async function addNewTag(name: string, color: string): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  if (!name.trim()) return;
  await createTag(business.id, name.trim(), color);
  revalidatePath("/clients");
}

export async function tagContact(contactId: string, tagId: string): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  await addTagToContact(business.id, contactId, tagId);
  revalidatePath("/clients");
}

export async function untagContact(contactId: string, tagId: string): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  await removeTagFromContact(business.id, contactId, tagId);
  revalidatePath("/clients");
}

// --- Tasks ---
export async function addTask(params: { title: string; description?: string; priority?: string; dueAt?: string | null }): Promise<void> {
  const title = params.title.trim();
  if (!title) return;
  const business = await getPrimaryBusiness();
  if (!business) return;
  await createTask({ businessId: business.id, title, description: params.description ?? null, priority: params.priority, dueAt: params.dueAt ?? null });
  revalidatePath("/tasks");
}

export async function changeTask(taskId: string, patch: { title?: string; description?: string; priority?: string; status?: string; due_at?: string | null }): Promise<void> {
  const business = await getPrimaryBusiness();
  if (!business) return;
  await updateTask(business.id, taskId, patch);
  revalidatePath("/tasks");
}
