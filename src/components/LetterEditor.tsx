import { useEffect, useRef } from "react";
import { looksLikeHtml } from "../lib/emailHtml";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

const COMMANDS: { cmd: string; label: string; value?: string; title: string }[] = [
  { cmd: "bold", label: "B", title: "Bold" },
  { cmd: "italic", label: "I", title: "Italic" },
  { cmd: "underline", label: "U", title: "Underline" },
  { cmd: "insertUnorderedList", label: "•", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
  { cmd: "formatBlock", label: "“", value: "blockquote", title: "Quote" },
];

export function LetterEditor({ value, onChange, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
        data-placeholder="Write the letter. Send asks you to confirm before it leaves."
        onInput={() => {
          if (ref.current) onChange(ref.current.innerHTML);
        }}
        suppressContentEditableWarning
      />
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
