// Inline link chips for chat — URL/bare-domain detection, GitHub-aware label
// shortening, and the chip icon. One source of truth shared by the composer
// highlight, user-bubble chips, and markdown links (approach mirrors
// Emanuele-web04/synara's linkChips).

const LINK_BODY = String.raw`[^\s<>()\[\]]+`;
const BARE_DOMAIN = String.raw`(?<![A-Za-z0-9@._/-])(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s<>()\[\]]*)?`;
const HTTP_URL = /^https?:\/\//i;

/** Matches http(s) URLs and public-looking bare domains in running text. */
export const LINK_TOKEN_REGEX = new RegExp(`https?:\\/\\/${LINK_BODY}|${BARE_DOMAIN}`, "g");

// Bare domains only chip when they look public (example.com yes, main.rs no).
const PUBLIC_BARE_TLDS = new Set(["ai", "app", "co", "com", "dev", "io", "net", "org"]);
const FILE_EXTENSION_TLDS = new Set([
  "c", "cc", "conf", "cpp", "css", "go", "h", "hpp", "html", "java", "js", "json", "jsx",
  "kt", "lock", "md", "mjs", "py", "rb", "rs", "sql", "swift", "toml", "ts", "tsx", "txt",
  "xml", "yaml", "yml",
]);

/** Trims sentence punctuation so `see https://x.com.` keeps the period as text. */
export function trimTrailingLinkPunctuation(url: string): string {
  return url.replace(/[.,;:!?'"]+$/, "");
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(HTTP_URL.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
}

function isLikelyBareDomainLink(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  const labels = host.split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (!/^[a-z]{2,63}$/.test(tld)) return false;
  if (labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) return false;
  const hasPathOrQuery = /[/?#]/.test(url);
  if (!hasPathOrQuery && FILE_EXTENSION_TLDS.has(tld)) return false;
  if (!hasPathOrQuery && !host.startsWith("www.") && !PUBLIC_BARE_TLDS.has(tld)) return false;
  return true;
}

/** Normalizes a matched token to an openable URL (bare domains get https://). */
export function normalizeLinkUrl(raw: string): string | null {
  const url = trimTrailingLinkPunctuation(raw.trim());
  if (!url) return null;
  if (HTTP_URL.test(url)) return url;
  return isLikelyBareDomainLink(url) ? `https://${url}` : null;
}

export interface LinkToken {
  kind: "text" | "link";
  /** The raw substring, exactly as it appears in the source text. */
  text: string;
  /** Openable URL — only on link tokens. */
  url?: string;
}

/** Splits running text into plain-text and link tokens for chip rendering. */
export function splitLinkTokens(text: string): LinkToken[] {
  const tokens: LinkToken[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_TOKEN_REGEX)) {
    const raw = trimTrailingLinkPunctuation(match[0]);
    const url = normalizeLinkUrl(raw);
    if (!url) continue;
    if (match.index > last) tokens.push({ kind: "text", text: text.slice(last, match.index) });
    tokens.push({ kind: "link", text: raw, url });
    last = match.index + raw.length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}

export interface LinkChipDescriptor {
  /** Display label: shortened GitHub reference, or the de-schemed URL. */
  label: string;
  /** Show the GitHub mark instead of the globe. */
  isGitHub: boolean;
}

// Shortens the common GitHub URL shapes into compact references:
//   pull/issue → owner/repo#155, commit → owner/repo@abc1234,
//   repo root  → owner/repo,      user/org → owner.
function shortenGitHubLink(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  if (!owner) return null;
  const repo = parts[1]?.replace(/\.git$/, "");
  if (!repo) return owner;
  const kind = parts[2];
  if (!kind) return `${owner}/${repo}`;
  const ref = parts[3];
  if ((kind === "pull" || kind === "issues") && ref && /^\d+$/.test(ref)) {
    return `${owner}/${repo}#${ref}`;
  }
  if (kind === "commit" && ref && /^[0-9a-f]{7,40}$/i.test(ref)) {
    return `${owner}/${repo}@${ref.slice(0, 7)}`;
  }
  return null; // tree/blob/etc. — render as a plain globe link
}

/** De-schemes a URL for a compact non-GitHub label. */
function prettifyUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** Describes how a URL should render as an inline chip. */
export function describeLinkChip(url: string): LinkChipDescriptor {
  const shortened = shortenGitHubLink(url);
  if (shortened) return { label: shortened, isGitHub: true };
  return { label: prettifyUrl(url), isGitHub: false };
}

// Chip icons as raw SVG so the markdown renderer (HTML strings) and the React
// chip share one drawing. GitHub mark; globe in buddy's hand-drawn stroke style.
export const LINK_CHIP_GITHUB_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;
export const LINK_CHIP_GLOBE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16"/></svg>`;

export function linkChipIconSvg(url: string): string {
  return describeLinkChip(url).isGitHub ? LINK_CHIP_GITHUB_SVG : LINK_CHIP_GLOBE_SVG;
}
