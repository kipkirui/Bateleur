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
  remoteImages?: boolean;
  onQuote?: (quote: string | null) => void;
};

export function letterHtml(message: Message): string | null {
  const html = message.htmlBody?.trim();
  if (html) return html;
  const body = message.body?.trim() ?? "";
  if (looksLikeHtml(body)) return body;
  return null;
}

export function Letter({ message, onMailTo, cidParts = [], remoteImages = false, onQuote }: Props) {
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
          <HtmlLetter
            key={`${message.id}-${remoteImages ? "remote" : "local"}`}
            html={src}
            remoteImages={remoteImages}
            onMailTo={onMailTo}
            onQuote={onQuote}
          />
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
        <TextLetter text={readableText(stripCssNoise(message.body))} onMailTo={onMailTo} onQuote={onQuote} />
      )}
    </>
  );
}

function readQuote(doc: Document): string | null {
  const raw = doc.getSelection()?.toString() ?? "";
  const line = raw.split(/\s+/).filter(Boolean).join(" ").trim();
  if (line.length < 3) return null;
  return line.slice(0, 400);
}

function HtmlLetter({
  html,
  remoteImages,
  onMailTo,
  onQuote,
}: {
  html: string;
  remoteImages: boolean;
  onMailTo: (mail: MailTo) => void;
  onQuote?: (quote: string | null) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onMailToRef = useRef(onMailTo);
  const onQuoteRef = useRef(onQuote);
  onMailToRef.current = onMailTo;
  onQuoteRef.current = onQuote;
  const srcdoc = sanitizeEmailHtml(html, remoteImages);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const iframe: HTMLIFrameElement = node;
    let cleanup: (() => void) | undefined;
    let scrollIdle = 0;

    function bind() {
      const doc = iframe.contentDocument;
      if (!doc) return;
      cleanup?.();

      const onClick = (event: globalThis.MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const anchor = target.closest("a");
        if (!anchor) return;
        const href = normalizeHref(anchor.getAttribute("href"));
        if (!href || href.startsWith("#")) return;
        event.preventDefault();
        event.stopPropagation();
        void handleHref(href, onMailToRef.current);
      };
      const onSelect = () => {
        onQuoteRef.current?.(readQuote(doc));
      };
      const onDragStart = (event: DragEvent) => {
        if (event.target instanceof HTMLImageElement) event.preventDefault();
      };

      let last = 0;
      let frame = 0;
      let held = false;
      let scrolling = false;
      let pendingX = 0;
      let pendingY = 0;
      let ticking = 0;

      const resize = () => {
        if (held || scrolling || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (held || scrolling) return;
          const height = Math.max(
            doc.documentElement?.scrollHeight ?? 0,
            doc.body?.scrollHeight ?? 0,
            120,
          );
          if (Math.abs(height - last) < 2) return;
          last = height;
          iframe.style.height = `${height}px`;
        });
      };

      const flushWheel = () => {
        ticking = 0;
        scrollReader(iframe, pendingX, pendingY, 0);
        pendingX = 0;
        pendingY = 0;
      };

      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        scrolling = true;
        window.clearTimeout(scrollIdle);
        scrollIdle = window.setTimeout(() => {
          scrolling = false;
          resize();
        }, 160);
        const pane = iframe.closest(".reader");
        const scaleX = pane instanceof HTMLElement ? pane.clientWidth : 1;
        const scaleY = pane instanceof HTMLElement ? pane.clientHeight : 1;
        let x = event.deltaX;
        let y = event.deltaY;
        if (event.deltaMode === 1) {
          x *= 16;
          y *= 16;
        } else if (event.deltaMode === 2) {
          x *= scaleX;
          y *= scaleY;
        }
        pendingX += x;
        pendingY += y;
        if (!ticking) ticking = requestAnimationFrame(flushWheel);
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        const pane = iframe.closest(".reader");
        if (!(pane instanceof HTMLElement)) return;
        const page = Math.max(pane.clientHeight * 0.9, 40);
        let dy = 0;
        if (event.key === "ArrowDown") dy = 48;
        else if (event.key === "ArrowUp") dy = -48;
        else if (event.key === "PageDown" || event.key === " ") dy = page;
        else if (event.key === "PageUp") dy = -page;
        else if (event.key === "Home") {
          pane.scrollTop = 0;
          event.preventDefault();
          return;
        } else if (event.key === "End") {
          pane.scrollTop = pane.scrollHeight;
          event.preventDefault();
          return;
        } else return;
        pane.scrollTop += dy;
        event.preventDefault();
      };

      const onDown = () => {
        held = true;
      };
      const onUp = () => {
        held = false;
        resize();
      };

      doc.addEventListener("click", onClick, true);
      doc.addEventListener("mouseup", onSelect);
      doc.addEventListener("keyup", onSelect);
      doc.addEventListener("dragstart", onDragStart);
      doc.addEventListener("wheel", onWheel, { passive: false, capture: true });
      doc.addEventListener("keydown", onKey);
      doc.addEventListener("pointerdown", onDown);
      doc.addEventListener("pointerup", onUp);
      doc.addEventListener("pointercancel", onUp);
      window.addEventListener("pointerup", onUp);
      resize();
      requestAnimationFrame(resize);
      const observer = new ResizeObserver(resize);
      if (doc.documentElement) observer.observe(doc.documentElement);
      if (doc.body) observer.observe(doc.body);
      for (const img of doc.images) {
        if (img.complete) continue;
        img.addEventListener("load", resize, { once: true });
        img.addEventListener("error", resize, { once: true });
      }
      const fonts = doc.fonts?.ready;
      if (fonts) void fonts.then(resize);

      cleanup = () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(ticking);
        window.clearTimeout(scrollIdle);
        doc.removeEventListener("click", onClick, true);
        doc.removeEventListener("mouseup", onSelect);
        doc.removeEventListener("keyup", onSelect);
        doc.removeEventListener("dragstart", onDragStart);
        doc.removeEventListener("wheel", onWheel, true);
        doc.removeEventListener("keydown", onKey);
        doc.removeEventListener("pointerdown", onDown);
        doc.removeEventListener("pointerup", onUp);
        doc.removeEventListener("pointercancel", onUp);
        window.removeEventListener("pointerup", onUp);
        observer.disconnect();
      };
    }

    iframe.addEventListener("load", bind);
    bind();
    return () => {
      iframe.removeEventListener("load", bind);
      cleanup?.();
      window.clearTimeout(scrollIdle);
    };
  }, [srcdoc]);

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

function TextLetter({
  text,
  onMailTo,
  onQuote,
}: {
  text: string;
  onMailTo: (mail: MailTo) => void;
  onQuote?: (quote: string | null) => void;
}) {
  const parts = linkify(text);

  async function onClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    event.preventDefault();
    await handleHref(href, onMailTo);
  }

  return (
    <pre
      className="letter"
      onMouseUp={() => onQuote?.(readQuote(document))}
      onKeyUp={() => onQuote?.(readQuote(document))}
    >
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

function scrollReader(
  iframe: HTMLIFrameElement,
  deltaX: number,
  deltaY: number,
  deltaMode: number,
) {
  const pane = iframe.closest(".reader");
  if (!(pane instanceof HTMLElement)) return;
  let x = deltaX;
  let y = deltaY;
  if (deltaMode === 1) {
    x *= 16;
    y *= 16;
  } else if (deltaMode === 2) {
    x *= pane.clientWidth;
    y *= pane.clientHeight;
  }
  pane.scrollTop += y;
  pane.scrollLeft += x;
}
