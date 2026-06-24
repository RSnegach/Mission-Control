"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { card, colors } from "@/components/ui";

type State = { error: string } | null;

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => (await login(formData)) ?? null,
    null,
  );

  return (
    <form action={formAction} style={{ ...card, padding: "28px 28px", width: 340 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            background: colors.accent,
            color: "var(--accent-contrast)",
            fontSize: 14,
          }}
        >
          ◉
        </span>
        <span style={{ fontWeight: 700 }}>Mission Control</span>
      </div>

      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 8,
        }}
      >
        Password
      </label>
      <input
        type="password"
        name="password"
        autoFocus
        disabled={pending}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          color: colors.foreground,
          fontSize: 14,
          outline: "none",
        }}
      />
      <input type="hidden" name="next" value={next} />

      {state?.error ? (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 18,
          width: "100%",
          padding: "10px 16px",
          borderRadius: 8,
          background: "var(--accent)",
          color: "var(--accent-contrast)",
          fontWeight: 600,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
        }}
      >
        {pending ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}
