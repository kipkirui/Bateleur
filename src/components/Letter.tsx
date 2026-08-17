import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  sanitizeEmailHtml,
  looksLikeHtml,
  looksLikeCssDump,
  stripCssNoise,
  readableText,
  rewriteCidImages,
} from "../lib/emailHtml";
import {
  isHttpUrl,
  linkify,
  normalizeHref,
  openExternal,
  parseMailto,
  type MailTo,
} from "../lib/links";
import type { InlinePart, Message } from "../types";

type Props = {
  message: Message;
  onMailTo: (mail: MailTo) => void;
  cidParts?: InlinePart[];
};

export function letterHtml(message: Message): string | null {
  const html = message.htmlBody?.trim();
  if (html) return html;
  const body = message.body?.trim() ?? "";
  if (looksLikeHtml(body)) return body;
  return null;
}

export function Letter({ message, onMailTo, cidParts = [] }: Props) {
  const html = letterHtml(message);
  const src = html ? rewriteCidImages(html, cidParts) : null;
  const [mode, setMode] = useState<"html" | "text">(src ? "html" : "text");

  useEffect(() => {
    setMode(src ? "html" : "text");
  }, [src, message.id]);

  return (
    <>
      {src && mode === "text" ? (
        <div className="letter-switch">
          <button type="button" className="text-btn" onClick={() => setMode("html")}>
            Show original HTML
          </button>
        </div>
      ) : null}
      {src && mode === "html" ? (
        <>
          <HtmlLetter key={message.id} html={src} onMailTo={onMailTo} />
          <div className="letter-switch">
            <button type="button" className="text-btn" onClick={() => setMode("text")}>
              Show plain text
            </button>
          </div>
        </>
      ) : looksLikeCssDump(message.body) && !readableText(stripCssNoise(message.body)) ? (
        <p className="muted">
          This letter is HTML. Sync the mailbox to load the designed version.
        </p>
      ) : (
        <TextLetter text={readableText(stripCssNoise(message.body))} onMailTo={onMailTo} />
      )}
    </>
  );
}

function HtmlLetter({ html, onMailTo }: { html: string; onMailTo: (mail: MailTo) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcdoc = sanitizeEmailHtml(html);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const iframe: HTMLIFrameElement = node;

    function bind() {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const onClick = (event: globalThis.MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const anchor = target.closest("a");
        if (!anchor) return;
        const href = normalizeHref(anchor.getAttribute("href"));
        if (!href || href.startsWith("#")) return;
        event.preventDefault();
        event.stopPropagation();
        void handleHref(href, onMailTo);
      };
      doc.addEventListener("click", onClick, true);
      const resize = () => {
        const height = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
          120,
        );
        iframe.style.height = `${height}px`;
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(doc.documentElement);
      if (doc.body) observer.observe(doc.body);
      return () => {
        doc.removeEventListener("click", onClick, true);
        observer.disconnect();
      };
    }

    let cleanup: (() => void) | undefined;
    const onLoad = () => {
      cleanup?.();
      cleanup = bind();
    };
    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") onLoad();
    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup?.();
    };
  }, [srcdoc, onMailTo]);

  return (
    <iframe
      ref={frameRef}
      className="letter-frame"
      title="Message body"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={srcdoc}
    />
  );
}

function TextLetter({ text, onMailTo }: { text: string; onMailTo: (mail: MailTo) => void }) {
  const parts = linkify(text);

  async function onClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    event.preventDefault();
    await handleHref(href, onMailTo);
  }

  return (
    <pre className="letter">
      {parts.map((part, index) => {
        if (part.kind === "text") return <span key={index}>{part.value}</span>;
        return (
          <a
            key={index}
            href={part.href}
            onClick={(event) => void onClick(event, part.href)}
          >
            {part.value}
          </a>
        );
      })}
    </pre>
  );
}

async function handleHref(href: string, onMailTo: (mail: MailTo) => void) {
  if (href.toLowerCase().startsWith("mailto:")) {
    const mail = parseMailto(href);
    if (mail) onMailTo(mail);
    return;
  }
  if (isHttpUrl(href)) {
    await openExternal(href);
  }
}
