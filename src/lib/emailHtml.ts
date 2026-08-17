const FORBIDDEN = new Set([
  "SCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "APPLET",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "LINK",
  "META",
  "BASE",
  "FRAME",
  "FRAMESET",
  "SVG",
  "MATH",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "TRACK",
  "TEMPLATE",
  "NOSCRIPT",
]);

const URL_ATTRS = new Set(["href", "src", "action", "background", "poster", "xlink:href"]);

export function looksLikeHtml(value: string): boolean {
  return /<!doctype\s+html/i.test(value)
    || /<\/?(html|head|body|div|table|tr|td|p|br|a|img|span|style|center|font|h[1-6]|section|article|strong|b|bold|em|i|u|ul|ol|li|hr)\b/i.test(value);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  lsquo: "'",
  rsquo: "'",
  sbquo: "'",
  ldquo: '"',
  rdquo: '"',
  bdquo: '"',
  bull: "•",
  middot: "·",
  times: "×",
  divide: "÷",
  plusmn: "±",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
};

/** Strip tags and decode entities for subjects, from-names, previews, and plain body. */
export function readableText(value: string): string {
  if (!value) return "";
  let text = value
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<head[\s\S]*?<\/head>/gi, "\n");
  text = text.replace(/<(br|p|div|tr|li|h[1-6]|blockquote|table|hr)\b[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  if (/<[^>]+>/.test(text)) {
    text = text.replace(/<[^>]+>/g, "");
    text = decodeEntities(text);
  }
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi, (entity, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[lower] ?? entity;
  });
}

export function looksLikeCssDump(value: string): boolean {
  const head = value.trimStart().slice(0, 800);
  return /(:root\s*\{|@font-face\s*\{|supported-color-schemes|mix-blend-mode\s*:)/i.test(head);
}

export function stripCssNoise(text: string): string {
  let out = text.replace(/<style[\s\S]*?<\/style>/gi, "\n");
  out = out.replace(/@font-face\s*\{[\s\S]*?\}/gi, "\n");
  out = out.replace(/:root\s*\{[\s\S]*?\}/gi, "\n");
  out = out.replace(/\/\*[\s\S]*?\*\//g, "\n");
  out = out.replace(/[^\n{]{0,200}\{[^{}]{0,400}\}/g, (block) => {
    if (
      /color-scheme|mix-blend-mode|supported-color-schemes|font-family|@media|@font-face|:root/i.test(
        block,
      )
    ) {
      return "\n";
    }
    return block;
  });
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function rewriteCidImages(
  html: string,
  parts: { contentId: string; contentType: string; data: string }[],
): string {
  if (!html || parts.length === 0) return html;
  const byId = new Map<string, string>();
  for (const part of parts) {
    const id = part.contentId.replace(/^<|>$/g, "").trim().toLowerCase();
    if (!id || !part.data) continue;
    const mime = part.contentType.trim() || "application/octet-stream";
    byId.set(id, `data:${mime};base64,${part.data}`);
  }
  if (byId.size === 0) return html;
  return html.replace(/cid:\s*<?([^>\s"'<>]+)>?/gi, (full, raw: string) => {
    const key = String(raw).replace(/^<|>$/g, "").trim().toLowerCase();
    return byId.get(key) ?? full;
  });
}

export function sanitizeEmailHtml(html: string): string {
  const recovered = wrapLeadingCss(html);
  const doc = new DOMParser().parseFromString(recovered, "text/html");
  for (const el of [...doc.querySelectorAll("*")]) {
    if (el.tagName === "BOLD") {
      const strong = doc.createElement("strong");
      strong.innerHTML = el.innerHTML;
      el.replaceWith(strong);
      continue;
    }
    if (FORBIDDEN.has(el.tagName)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!URL_ATTRS.has(name)) continue;
      const value = attr.value.trim();
      const lower = value.toLowerCase();
      if (lower.startsWith("data:image/")) continue;
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("vbscript:") ||
        lower.startsWith("file:")
      ) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href") {
        const ok =
          lower.startsWith("http://") ||
          lower.startsWith("https://") ||
          lower.startsWith("mailto:") ||
          lower.startsWith("#") ||
          lower.startsWith("cid:");
        if (!ok) el.removeAttribute(attr.name);
      }
      if (
        (name === "src" || name === "background" || name === "poster") &&
        !/^https?:\/\//i.test(value) &&
        !lower.startsWith("data:image/") &&
        !lower.startsWith("cid:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.hasAttribute("style")) {
      el.setAttribute("style", scrubCss(el.getAttribute("style") ?? ""));
    }
  }
  hoistCssTextNodes(doc);
  const cssParts: string[] = [];
  for (const style of [...doc.querySelectorAll("style")]) {
    cssParts.push(scrubCss(style.textContent ?? ""));
    style.remove();
  }
  return wrapEmailDocument(cssParts, doc.body?.innerHTML ?? "");
}

function wrapLeadingCss(html: string): string {
  const trimmed = html.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) return html;
  const idx = trimmed.search(/<[a-zA-Z!/]/);
  if (idx < 0) {
    return looksLikeCssDump(trimmed) ? `<style>${trimmed}</style>` : html;
  }
  const leading = trimmed.slice(0, idx);
  const rest = trimmed.slice(idx);
  if (looksLikeCssDump(leading) || /\{[^}]{8,}\}/.test(leading)) {
    return `<style>${leading}</style>${rest}`;
  }
  return html;
}

function hoistCssTextNodes(doc: Document) {
  const body = doc.body;
  if (!body) return;
  for (const node of [...body.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent ?? "";
    if (!looksLikeCssDump(text) && !/@(font-face|media)\b/.test(text)) continue;
    const style = doc.createElement("style");
    style.textContent = text;
    doc.head.appendChild(style);
    node.remove();
  }
}

function wrapEmailDocument(cssParts: string[], body: string): string {
  const author = cssParts
    .filter((css) => css.trim().length > 0)
    .map((css) => `<style>${css}</style>`)
    .join("\n");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <meta name="color-scheme" content="light dark" />
    <style>
      html, body { margin: 0; padding: 0; }
      img { max-width: 100% !important; height: auto !important; }
    </style>
    ${author}
  </head>
  <body>${body}</body>
</html>`;
}

function scrubCss(css: string): string {
  return css
    .replace(/expression\s*\([^)]*\)/gi, "none")
    .replace(/@import[^;]+;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/-moz-binding\s*:[^;]+;?/gi, "")
    .replace(/behavior\s*:[^;]+;?/gi, "")
    .replace(/<\/style/gi, "");
}
