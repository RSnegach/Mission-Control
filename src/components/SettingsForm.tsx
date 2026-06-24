"use client";

import { useState } from "react";
import { renderTemplate } from "@/lib/template";
import { card, colors } from "./ui";

/**
 * Edit the missed-call follow-up: enable toggle, template text, and the route
 * phone. Submits to the saveSettings server action. Shows a live preview of the
 * rendered message as the template is typed.
 */
export function SettingsForm({
  action,
  businessName,
  enabled,
  template,
  defaultRoutePhone,
  ackEnabled,
  ackTemplate,
}: {
  action: (formData: FormData) => void | Promise<void>;
  businessName: string;
  enabled: boolean;
  template: string;
  defaultRoutePhone: string;
  ackEnabled: boolean;
  ackTemplate: string;
}) {
  const [text, setText] = useState(template);
  const preview = renderTemplate(text || "", { business: businessName, name: "there" });
  const [ackText, setAckText] = useState(ackTemplate);
  const ackPreview = renderTemplate(ackText || "", { business: businessName, name: "there" });

  return (
    <form action={action} style={{ ...card, padding: "22px 24px", maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
        Missed-call text follow-up
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: "0 0 20px" }}>
        When a call is missed, automatically text the caller. Edit the message below.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
        <input
          type="checkbox"
          name="sms_followup_enabled"
          defaultChecked={enabled}
          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 14 }}>Send an automatic text when a call is missed</span>
      </label>

      <label style={labelStyle}>Message template</label>
      <textarea
        name="sms_followup_template"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          color: colors.foreground,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
        }}
      />
      <p style={{ color: colors.muted, fontSize: 12, margin: "8px 0 0" }}>
        Use <code>{"{business}"}</code> for your business name and <code>{"{name}"}</code> for
        the caller. <code>{"{name}"}</code> becomes &quot;there&quot; when the caller is unknown.
      </p>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Preview</label>
        <div
          style={{
            alignSelf: "flex-end",
            maxWidth: "78%",
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 12,
            borderBottomRightRadius: 3,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          {preview || "Your message will appear here."}
        </div>
      </div>

      <div style={{ height: 1, background: colors.border, margin: "28px 0" }} />

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
        Auto-acknowledgment text
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: "0 0 20px" }}>
        After a caller replies, automatically text them back once, about 30 seconds
        after their last message. Edit the message below.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
        <input
          type="checkbox"
          name="ack_enabled"
          defaultChecked={ackEnabled}
          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 14 }}>Send an automatic acknowledgment after a caller replies</span>
      </label>

      <label style={labelStyle}>Acknowledgment template</label>
      <textarea
        name="ack_template"
        value={ackText}
        onChange={(e) => setAckText(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          color: colors.foreground,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
        }}
      />
      <p style={{ color: colors.muted, fontSize: 12, margin: "8px 0 0" }}>
        Use <code>{"{business}"}</code> and <code>{"{name}"}</code>. Sent once, about
        30 seconds after the caller stops texting.
      </p>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Preview</label>
        <div
          style={{
            maxWidth: "78%",
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 12,
            borderBottomRightRadius: 3,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          {ackPreview || "Your message will appear here."}
        </div>
      </div>

      <div style={{ height: 1, background: colors.border, margin: "28px 0" }} />

      <label style={{ ...labelStyle, marginTop: 0 }}>Forward calls to</label>
      <input
        name="default_route_phone"
        defaultValue={defaultRoutePhone}
        placeholder="+13215550199"
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 8,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          color: colors.foreground,
          fontSize: 14,
          outline: "none",
        }}
      />

      <div style={{ marginTop: 24 }}>
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "var(--accent-contrast)",
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          Save settings
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 8,
};
