// Inline link chip — GitHub mark + shortened reference for github.com URLs,
// globe + de-schemed URL for everything else. LinkifiedText turns the plain
// text of a user bubble into text + chips (assistant replies get the same
// treatment through the markdown renderer).

import { openUrl } from "@tauri-apps/plugin-opener";
import { describeLinkChip, linkChipIconSvg, splitLinkTokens } from "../../lib/linkChips";

export function InlineLinkChip({ url }: { url: string }) {
  const { label } = describeLinkChip(url);
  return (
    <button
      type="button"
      className="link-chip"
      title={url}
      onClick={(e) => {
        e.stopPropagation();
        void openUrl(url);
      }}
    >
      <span aria-hidden dangerouslySetInnerHTML={{ __html: linkChipIconSvg(url) }} />
      <span className="link-chip-label">{label}</span>
    </button>
  );
}

export function LinkifiedText({ text }: { text: string }) {
  const tokens = splitLinkTokens(text);
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === "link" && t.url ? <InlineLinkChip key={i} url={t.url} /> : t.text,
      )}
    </>
  );
}
