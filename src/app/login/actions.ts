"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Check the shared site password and, on match, set the gate cookie. Returns an
 * error string on mismatch (shown by the login form). On success it redirects.
 */
export async function login(formData: FormData): Promise<{ error: string } | void> {
  const password = process.env.SITE_PASSWORD;
  // If no password is configured the gate is off; just go in.
  if (!password) redirect("/dashboard");

  const entered = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (entered !== password) {
    return { error: "Incorrect password." };
  }

  const store = await cookies();
  store.set("mc_gate", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(next.startsWith("/") ? next : "/dashboard");
}
