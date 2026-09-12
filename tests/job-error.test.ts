import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import JobsError from "@/app/(public)/jobs/error";

function retryButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === "button") return node as ReactElement<{ onClick: () => void }>;
  for (const child of [node.props.children].flat()) {
    const found = retryButton(child);
    if (found) return found;
  }
}

it("renders an accessible jobs outage recovery and retries", () => {
  const retry = vi.fn();
  const element = JobsError({ retry });
  const markup = renderToStaticMarkup(element);

  expect(markup).toContain('role="alert"');
  expect(markup).toContain("공고를 불러오지 못했습니다.");
  expect(markup).toContain("다시 시도 / Retry");
  expect(markup).toContain('href="/jobs"');
  expect(markup).not.toContain("지원 현황");
  retryButton(element)!.props.onClick();
  expect(retry).toHaveBeenCalledOnce();
});
