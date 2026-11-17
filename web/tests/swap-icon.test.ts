import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwapIcon } from "@/components/site/SwapIcon";

describe("SwapIcon", () => {
  it("renders one still icon at first, with no swap animation", () => {
    const markup = renderToStaticMarkup(createElement(SwapIcon, { name: "star" }));
    expect(markup).toContain('class="icon-swap"');
    expect(markup).toContain('data-icon="star"');
    expect(markup).not.toContain("icon-swap-in");
    expect(markup).not.toContain("icon-swap-out");
    expect(markup.match(/<svg/g)).toHaveLength(1);
  });
});
