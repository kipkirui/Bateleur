import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { looksLikeHtml } from "../lib/emailHtml";
import { matchSnippets, parseTrigger, type Snippet } from "../lib/snippets";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  snippets?: Snippet[];
};

const COMMANDS: { cmd: string; label: string; value?: string; title: string }[] = [
  { cmd: "bold", label: "B", title: "Bold" },
  { cmd: "italic", label: "I", title: "Italic" },
  { cmd: "underline", label: "U", title: "Underline" },
  { cmd: "insertUnorderedList", label: "•", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
  { cmd: "formatBlock", label: "“", value: "blockquote", title: "Quote" },
];

export function LetterEditor({ value, onChange, disabled, snippets = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hits, setHits] = useState<Snippet[]>([]);
  const [active, setActive] = useState(0);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    const node = ref.current;
    if (!node || document.activeElement === node) return;
    const next = toEditorHtml(value);
    if (node.innerHTML !== next) node.innerHTML = next;
  }, [value]);

  function run(command: string, commandValue?: string) {
    const node = ref.current;
    if (!node || disabled) return;
    node.focus();
    document.execCommand(command, false, commandValue);
    onChange(node.innerHTML);
  }

  function onLink() {
    const href = window.prompt("Link address", "https://");
    if (!href) return;
    run("createLink", href.trim());
  }

  function scan() {
    const before = textBeforeCaret(ref.current);
    const parsed = parseTrigger(before);
    if (!parsed) {
      setHits([]);
      setRaw("");
      return;
    }
    const next = matchSnippets(parsed.token, snippets);
    setHits(next);
    setRaw(parsed.raw);
    setActive(0);
  }

  function insert(snippet: Snippet) {
    const node = ref.current;
    if (!node || disabled) return;
    node.focus();
    for (let i = 0; i < raw.length; i += 1) {
      document.execCommand("delete", false);
    }
    document.execCommand("insertText", false, snippet.body);
    onChange(node.innerHTML);
    setHits([]);
    setRaw("");
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + hits.length) % hits.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const hit = hits[active];
      if (!hit) return;
      event.preventDefault();
      insert(hit);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setHits([]);
    }
  }

  return (
    <div className="letter-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Letter formatting">
        {COMMANDS.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            aria-label={item.title}
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();
              run(item.cmd, item.value);
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          title="Link"
          aria-label="Link"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            onLink();
          }}
        >
          Link
        </button>
      </div>
      <div
        ref={ref}
        className="editor-surface"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label="Letter body"
        data-placeholder="Write the letter. ::thanks or /followup inserts a snippet. Send asks you to confirm."
        onInput={() => {
          if (ref.current) onChange(ref.current.innerHTML);
          scan();
        }}
        onKeyDown={onKey}
        suppressContentEditableWarning
      />
      {hits.length > 0 ? (
        <ul className="snippet-menu" role="listbox" aria-label="Snippets">
          {hits.map((snippet, index) => (
            <li key={snippet.id}>
              <button
                type="button"
                className={index === active ? "active" : undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(snippet);
                }}
              >
                <kbd>::{snippet.trigger}</kbd>
                <span>{snippet.body}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function toEditorHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "<p><br></p>";
  if (looksLikeHtml(trimmed)) return value;
  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p>${lines || "<br>"}</p>`;
    })
    .join("");
}

function textBeforeCaret(node: HTMLDivElement | null): string {
  if (!node) return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !node.contains(selection.anchorNode)) {
    return "";
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  range.setStart(node, 0);
  return range.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
