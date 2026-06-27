"use client";

import { useState, useTransition } from "react";
import { addContact } from "@/app/(app)/ops-actions";
import { colors, card } from "./ui";

/** Button + inline form to manually add a contact. */
export function AddContactButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [, start] = useTransition();

  function submit() {
    if (!name.trim() && !phone.trim()) return;
    start(() => addContact({ name, phone, email }));
    setName(""); setPhone(""); setEmail("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        border: "none", background: "var(--accent)", color: "var(--accent-contrast)",
      }}>+ Add client</button>
    );
  }

  return (
    <div style={{ ...card, padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={inp} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (e.g. +13215551234)" style={inp} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" style={inp} />
      <button onClick={submit} disabled={!name.trim() && !phone.trim()} style={{
        padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        border: "none", background: "var(--accent)", color: "var(--accent-contrast)",
      }}>Add</button>
      <button onClick={() => setOpen(false)} style={{
        padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        border: `1px solid ${colors.border}`, background: "transparent", color: colors.muted,
      }}>Cancel</button>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, fontSize: 14, flex: "1 1 160px",
  background: colors.background, border: `1px solid ${colors.border}`, color: colors.foreground, outline: "none",
};
