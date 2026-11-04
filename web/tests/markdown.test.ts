import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/puzzle/Markdown";

function render(source: string): string {
  return renderToStaticMarkup(createElement(Markdown, { source }));
}

describe("Markdown", () => {
  it("renders GFM tables, strikethrough and task lists", () => {
    const html = render(
      ["| A | B |", "|---|---|", "| `x` | y |", "", "~~old~~", "", "- [x] done", "- [ ] not yet"].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td><code>x</code></td>");
    expect(html).toContain("<del>old</del>");
    expect(html).toMatch(/<input type="checkbox" disabled="" checked=""\/>/);
  });

  it("drops raw HTML", () => {
    const html = render("before\n\n<script>alert(1)</script>\n\n<b>bold</b> after");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("before");
  });

  it("turns a mermaid block into a diagram placeholder, without mermaid on the server", () => {
    const html = render("```mermaid\nflowchart LR\n  a --> b\n```");
    expect(html).toContain('data-testid="mermaid-diagram"');
    expect(html).toContain('data-state="loading"');
    expect(html).not.toContain("<pre>");
  });

  it("leaves other fenced code as a code block", () => {
    const html = render("```ts\nconst a = 1;\n```");
    expect(html).toContain('<pre><code class="language-ts">const a = 1;\n</code></pre>');
    expect(html).not.toContain("mermaid-diagram");
  });
});
