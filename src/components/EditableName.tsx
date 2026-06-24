"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { renameContact } from "@/app/(app)/clients/actions";
import { colors } from "./ui";

/**
 * Inline-editable client name. Shows the name (or "Unnamed caller") with a pencil
 * that opens a small editor. Saving writes through the renameContact server action
 * and optimistically updates the local display; the change persists everywhere the
 * contact is referenced.
 */
export function EditableName({
  contactId,
  name,
  href,
  onSaved,
}: {
  contactId: string;
  name: string | null;
  href?: string;
  onSaved?: (name: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [current, setCurrent] = useState<string | null>(name);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync if the server sends a new value (e.g. after revalidation).
  useEffect(() => {
    setCurrent(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function open() {
    setValue(current ?? "");
    setEditing(true);
  }

  function save() {
    const next = value.trim().slice(0, 80) || null;
    setCurrent(next);
    setEditing(false);
    onSaved?.(next);
    startTransition(() => {
      renameContact(contactId, value);
    });
  }

  function cancel() {
    setEditing(false);
    setValue(current ?? "");
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          ref={inputRef}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          placeholder="Add a name"
          maxLength={80}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 14,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            color: colors.foreground,
            outline: "none",
            minWidth: 160,
          }}
        />
        <button onClick={save} disabled={pending} style={btn(true)} title="Save">
          Save
        </button>
        <button onClick={cancel} disabled={pending} style={btn(false)} title="Cancel">
          Cancel
        </button>
      </span>
    );
  }

  const named = Boolean(current);
  const label = current || "Unnamed caller";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {href ? (
        <Link
          href={href}
          style={{
            color: named ? "var(--accent)" : colors.muted,
            textDecoration: "none",
            fontWeight: named ? 500 : 400,
            fontStyle: named ? "normal" : "italic",
          }}
        >
          {label}
        </Link>
      ) : (
        <span style={{ color: named ? colors.foreground : colors.muted, fontStyle: named ? "normal" : "italic" }}>
          {label}
        </span>
      )}
      <button
        onClick={open}
        title={named ? "Rename" : "Add a name"}
        aria-label={named ? "Rename client" : "Add a name"}
        style={{
          border: "none",
          background: "transparent",
          color: colors.muted,
          cursor: "pointer",
          fontSize: 13,
          lineHeight: 1,
          padding: 2,
        }}
      >
        &#9998;
      </button>
    </span>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${colors.border}`,
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "#fff" : colors.muted,
  };
}
