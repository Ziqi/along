import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Mark } from "@/components/capcom/mark";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <Mark className="size-6 text-fg" />
          <div>
            <p className="text-lg font-medium tracking-[0.18em]">ALONG</p>
            <p className="text-sm text-muted">登录后，纪要保存在云端</p>
          </div>
        </div>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="w-full cursor-pointer border border-line bg-surface px-4 py-3 text-sm hover:bg-elevated"
            >
              用 {p.label} 继续
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">登录暂未打开。</p>
        )}
        <a href="/" className="block text-sm text-muted hover:text-fg">
          先不用，回课堂
        </a>
      </div>
    </main>
  );
}
