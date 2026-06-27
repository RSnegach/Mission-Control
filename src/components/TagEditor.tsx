"use client";

import { useState, useTransition } from "react";
import type { Tag } from "@/lib/types";
import { tagContact, untagContact } from "@/app/(app)/ops-actions";
import { colors } from "./ui";

/** Show a contact's tags as removable pills + a picker to add available tags. */
export function TagEditor({
  contactId,
  allTags,
  tagIds,
}: {
  contactId: string;
  allTags: Tag[];
  tagIds: string[];
}) {
  const [ids, setIds] = useState<Set<string>>(new Set(tagIds));
  const [, start] = useTransition();
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const available = allTags.filter((t) => !ids.has(t.id));

  function add(tagId: string) {
    setIds((p) => new Set(p).add(tagId));
    start(() => tagContact(contactId, tagId));
  }
  function remove(tagId: string) {
    setIds((p) => { const n = new Set(p); n.delete(tagId); return n; });
    start(() => untagContact(contactId, tagId));
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {[...ids].map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        return (
          <span key={id} style={pill(t.color)}>
            {t.name}
            <button onClick={() => remove(id)} aria-label={`Remove ${t.name}`} style={xBtn(t.color)}>✕</button>
          </span>
        );
      })}
      {available.length > 0 ? (
        <select
          value=""
          onChange={(e) => { if (e.target.value) add(e.target.value); }}
          style={{
            padding: "4px 8px", borderRadius: 999, fontSize: 12,
            background: colors.card, border: `1px dashed ${colors.border}`, color: colors.muted, cursor: "pointer",
          }}
        >
          <option value="">+ Tag</option>
          {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      ) : null}
    </div>
  );
}

function pill(color: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 4px 2px 10px",
    borderRadius: 999, fontSize: 12, fontWeight: 600, color,
    background: `color-mix(in srgb, ${color} 14%, var(--surface))`,
    border: `1px solid color-mix(in srgb, ${color} 35%, var(--surface))`,
  };
}
function xBtn(color: string): React.CSSProperties {
  return { border: "none", background: "transparent", color, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "2px 4px" };
}
