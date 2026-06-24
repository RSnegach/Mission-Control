"use client";

import { useState } from "react";
import Link from "next/link";
import type { Call, CallRequest, Contact, Message } from "@/lib/types";
import { formatTime, formatDuration } from "@/lib/format";
import { CallStatusBadge } from "./Badge";
import { MessageThread } from "./MessageThread";
import { CallTimeline } from "./CallTimeline";
import { RequestStatusBadge } from "./Badge";
import { colors, rowBorder } from "./ui";

/** Enriched call view model assembled on the server and passed to the client. */
export interface CallView {
  call: Call;
  contact: Contact | null;
  messages: Message[];
  request: CallRequest | null;
}

export function CallRow({ view, timezone }: { view: CallView; timezone: string }) {
  const [expanded, setExpanded] = useState(false);
  const { call, contact, messages, request } = view;

  const callerName = contact?.name || call.from_number || "Unknown";
  const outboundCount = messages.filter((m) => m.direction === "outbound").length;
  const replyCount = messages.filter((m) => m.direction === "inbound").length;

  // Text summary on the collapsed row, so you can see SMS state without expanding.
  let smsHint = "No text sent";
  if (outboundCount > 0 && replyCount > 0) smsHint = `Texted · ${replyCount} repl${replyCount === 1 ? "y" : "ies"}`;
  else if (outboundCount > 0) smsHint = "Texted · no reply yet";

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{ ...rowBorder, cursor: "pointer" }}
      >
        <td style={td}>
          <span style={{ display: "inline-block", width: 14, color: colors.muted }}>
            {expanded ? "▾" : "▸"}
          </span>
          {callerName}
          {contact?.name && call.from_number ? (
            <span style={{ color: colors.muted, marginLeft: 6 }}>{call.from_number}</span>
          ) : null}
        </td>
        <td style={td}>
          <CallStatusBadge call={call} />
        </td>
        <td style={{ ...td, color: colors.muted }}>{smsHint}</td>
        <td style={td}>{call.route_target || "—"}</td>
        <td style={td}>{formatTime(call.created_at, timezone)}</td>
        <td style={td}>{formatDuration(call.duration_seconds)}</td>
      </tr>

      {expanded ? (
        <tr style={rowBorder}>
          <td colSpan={6} style={{ padding: 0 }}>
            <div
              style={{
                background: colors.background,
                padding: "18px 20px 22px",
                display: "flex",
                flexWrap: "wrap",
                gap: 28,
              }}
            >
              {/* SMS thread */}
              <div style={{ flex: "2 1 340px", minWidth: 0 }}>
                <Heading>Text follow-up</Heading>
                <MessageThread
                  messages={messages}
                  timezone={timezone}
                  emptyText="No automated text was sent for this call."
                />
              </div>

              {/* Right column: timeline + request + contact */}
              <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <Heading>Call timeline</Heading>
                  <CallTimeline call={call} timezone={timezone} />
                </div>

                <div>
                  <Heading>Linked request</Heading>
                  {request ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <RequestStatusBadge status={request.status} />
                      <Link href="/requests" style={linkStyle}>
                        {request.title}
                      </Link>
                    </div>
                  ) : (
                    <span style={{ color: colors.muted, fontSize: 13 }}>None</span>
                  )}
                </div>

                <div>
                  <Heading>Client</Heading>
                  {contact ? (
                    <Link href={`/clients/${contact.id}`} style={linkStyle}>
                      {contact.name || contact.phone || "View profile"}
                    </Link>
                  ) : (
                    <span style={{ color: colors.muted, fontSize: 13 }}>Unknown caller</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
      {children}
    </div>
  );
}

const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
const linkStyle: React.CSSProperties = { color: "var(--accent)", textDecoration: "none", fontSize: 14 };
