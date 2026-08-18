import { useEffect, useMemo, useRef, useState } from "react";
import { readableText } from "../lib/emailHtml";
import type { Message } from "../types";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Row =
  | { kind: "command"; id: string; label: string; hint?: string; run: () => void }
  | { kind: "mail"; id: string; message: Message };

type Props = {
  commands: PaletteCommand[];
  hits: Message[];
  searching: boolean;
  onQuery: (value: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
};

export function Palette({
  commands,
  hits,
  searching,
  onQuery,
  onClose,
  onOpen,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    const commandsOnly = q.startsWith(">");
    const needle = commandsOnly ? q.slice(1).trim() : q;
    const shownCommands: Row[] = commands
      .filter((command) => {
        if (!needle) return true;
        return `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(needle);
      })
      .slice(0, 8)
      .map((command) => ({ kind: "command", ...command }));
    const shownMail: Row[] = commandsOnly
      ? []
      : hits.slice(0, 12).map((message) => ({
          kind: "mail",
          id: `mail:${message.id}`,
          message,
        }));
    return [...shownCommands, ...shownMail];
  }, [commands, hits, text]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [text, hits]);

  function pick(index: number) {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "command") row.run();
    else onOpen(row.message.id);
  }

  return (
    <div className="overlay overlay-palette" role="dialog" aria-modal="true">
      <div className="palette">
        <input
          ref={inputRef}
          value={text}
          placeholder="Search mail or jump — > for commands"
          aria-label="Search mail or command"
          onChange={(e) => {
            setText(e.target.value);
            onQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((n) => (rows.length === 0 ? 0 : (n + 1) % rows.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => (rows.length === 0 ? 0 : (n - 1 + rows.length) % rows.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(active);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {rows.length === 0 ? (
            <p className="muted">
              {searching
                ? "Searching…"
                : text.trim().length < 2
                  ? "Type a word, or > for commands."
                  : "Nothing matches."}
            </p>
          ) : (
            rows.map((row, index) => (
              <button
                key={row.id}
                type="button"
                className={index === active ? "palette-row active" : "palette-row"}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                {row.kind === "command" ? (
                  <>
                    <span>{row.label}</span>
                    {row.hint ? <span className="muted">{row.hint}</span> : null}
                  </>
                ) : (
                  <>
                    <span>{readableText(row.message.subject)}</span>
                    <span className="muted">
                      {readableText(row.message.fromName)} · {row.message.folder}
                    </span>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
