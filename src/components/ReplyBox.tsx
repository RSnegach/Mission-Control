"use client";

import { useState, useTransition } from "react";
import { sendManualMessage } from "@/app/(app)/ops-actions";
import { colors } from "./ui";

/** Inline SMS reply composer at the bottom of a conversation thread. */
export function ReplyBox({ contactId }: { contactId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    start(() => {
      sendManualMessage(contactId, body);
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Type a reply and press Enter"
        disabled={pending}
        style={{
          flex: 1,
          padding: "9px 12px",
          borderRadius: 8,
          fontSize: 14,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          color: colors.foreground,
          outline: "none",
        }}
      />
      <button
        onClick={send}
        disabled={pending || !text.trim()}
        style={{
          padding: "9px 18px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          border: "none",
          background: "var(--accent)",
          color: "var(--accent-contrast)",
          opacity: pending || !text.trim() ? 0.6 : 1,
        }}
      >
        {pending ? "Sending..." : "Send"}
      </button>
    </div>
  );
}
