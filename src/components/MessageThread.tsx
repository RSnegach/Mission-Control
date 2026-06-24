import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { colors } from "./ui";

/**
 * SMS conversation as chat bubbles. Outbound (we texted them) align right with
 * the accent color; inbound (their replies) align left on a card background.
 * Messages should be passed oldest-first.
 */
export function MessageThread({
  messages,
  timezone,
  emptyText = "No messages.",
}: {
  messages: Message[];
  timezone: string;
  emptyText?: string;
}) {
  if (messages.length === 0) {
    return <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{emptyText}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map((m) => {
        const outbound = m.direction === "outbound";
        return (
          <div
            key={m.id}
            style={{
              alignSelf: outbound ? "flex-end" : "flex-start",
              maxWidth: "78%",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.4,
                color: outbound ? "#fff" : colors.foreground,
                background: outbound ? "var(--accent)" : colors.card,
                border: outbound ? "none" : `1px solid ${colors.border}`,
                borderBottomRightRadius: outbound ? 3 : 12,
                borderBottomLeftRadius: outbound ? 12 : 3,
              }}
            >
              {m.body}
            </div>
            <div
              style={{
                fontSize: 11,
                color: colors.muted,
                marginTop: 3,
                textAlign: outbound ? "right" : "left",
              }}
            >
              {outbound ? "Sent" : "Reply"} · {formatTime(m.created_at, timezone)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
