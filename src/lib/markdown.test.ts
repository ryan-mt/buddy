// @vitest-environment jsdom
//
// jsdom here on purpose: DOMPurify's attribute sanitization (javascript: href
// removal, the rel hook) silently no-ops under happy-dom, which would make
// these XSS regression tests pass-through lies.
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders basic markdown", () => {
    const html = renderMarkdown("**bold** and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("strips script tags and event handlers", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("renders links as chips with rel=noreferrer", () => {
    const html = renderMarkdown("see https://example.com/docs");
    expect(html).toContain('class="link-chip"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("autolinked GitHub PRs get the shortened chip label", () => {
    const html = renderMarkdown("https://github.com/foo/bar/pull/12");
    expect(html).toContain("foo/bar#12");
  });

  it("explicit [text](url) keeps its own label", () => {
    const html = renderMarkdown("[the docs](https://example.com)");
    expect(html).toContain("the docs");
  });

  it("javascript: URLs do not survive sanitization as clickable links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain('href="javascript:');
  });
});
