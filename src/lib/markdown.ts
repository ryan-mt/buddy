// Markdown → sanitized HTML for chat messages (marked + DOMPurify). Styling
// lives under `.chat-md` in styles/chat.css; links open externally via the
// click handler in ChatMessage (never navigate the webview).
//
// Links render as inline chips — GitHub mark + shortened reference for
// github.com URLs, globe + de-schemed URL otherwise (same descriptor the
// user-bubble chips use, so every surface formats links identically).

import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { describeLinkChip, linkChipIconSvg } from "./linkChips";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

marked.setOptions({ gfm: true, breaks: true });

marked.use({
  renderer: {
    link(token: Tokens.Link): string {
      const href = token.href;
      // Autolinked URLs (text == href modulo the implied scheme) get the
      // shortened chip label; explicit [text](url) keeps its own text.
      const isBare =
        token.text === href ||
        `http://${token.text}` === href ||
        `https://${token.text}` === href;
      const inner = isBare
        ? escapeHtml(describeLinkChip(href).label)
        : this.parser.parseInline(token.tokens);
      return (
        `<a href="${escapeHtml(href)}" class="link-chip" title="${escapeHtml(href)}">` +
        `${linkChipIconSvg(href)}<span class="link-chip-label">${inner}</span></a>`
      );
    },
  },
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noreferrer");
  }
});

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false });
  return DOMPurify.sanitize(html);
}
