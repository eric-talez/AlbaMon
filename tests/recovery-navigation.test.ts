import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement, type ReactNode, type ReactElement } from "react";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import type { AuthUser } from "@/lib/auth/types";
const user = { id:"user",email:"user@example.invalid",role:"employer",aal:"aal1",accountStatus:"active",displayName:null,isDev:false } as AuthUser;
function button(node: ReactNode): ReactElement<{onClick:()=>void}> | undefined {
  if (!isValidElement<{children?:ReactNode}>(node)) return;
  if(node.type === "button") return node as ReactElement<{onClick:()=>void}>;
  for(const child of [node.props.children].flat()) { const found = button(child); if(found) return found; }
}
it("both fixed-text error boundaries retry and never expose exception details", () => {
  for(const Component of [ErrorPage,GlobalError]) {
    const retry = vi.fn();
    const element = Component({retry});
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("잠시 불러오지 못했습니다");
    expect(markup).toContain('/dashboard/applications');
    button(element)!.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  }
  expect(renderToStaticMarkup(GlobalError({retry:vi.fn()}))).toContain('<html lang="ko">');
  expect(renderToStaticMarkup(createElement(NotFound))).toContain('href="/jobs"');
});
it("public account destinations use the supplied verified server session", () => {
  const signedOut = renderToStaticMarkup(createElement(SiteHeader, {user:null}));
  expect(signedOut).toContain('href="/login"');
  const signedIn = renderToStaticMarkup(createElement(SiteHeader, {user}));
  expect(signedIn).not.toContain('href="/login"');
  expect(signedIn).toContain('href="/employer"');
  expect(signedIn).toContain('로그아웃');
  expect(renderToStaticMarkup(createElement(MobileBottomNav, {user}))).toContain('href="/dashboard/profile"');
});
