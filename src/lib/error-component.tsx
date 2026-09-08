import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

/** The crash screen: the app's own palette, Chinese, and the message kept visible. */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-abort" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-medium">这一页出错了</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "刷新一次再试。"}
      </p>
      <a href="/" className="text-base underline decoration-fg/30 underline-offset-4">
        回课堂
      </a>
    </main>
  );
}

/** A path with no page behind it. */
export function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-fg">
      <p className="text-lg">这里没有页面。</p>
      <a href="/" className="text-base underline decoration-fg/30 underline-offset-4">
        回课堂
      </a>
    </main>
  );
}
