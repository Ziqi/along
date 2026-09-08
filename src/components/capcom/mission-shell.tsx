import { MissionBar } from "@/components/capcom/mission-bar";
import { JotPad } from "@/components/capcom/jot-pad";
import { useCapcomEngine } from "@/components/capcom/use-engine";
import { arm, goHomeSafe, safe } from "@/lib/engine";
import { setAppNav } from "@/lib/nav";
import { useCapcom } from "@/lib/store";
import { applyTheme, readTheme } from "@/lib/theme";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";

class ShellCatch extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "界面出错了" };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-dvh flex-col gap-3 bg-bg p-6 text-fg">
          <p className="text-base">页面出错了，刷新即可。</p>
          <p className="text-sm text-muted">{this.state.err}</p>
          <button
            type="button"
            className="self-start border border-line px-3 py-2 text-sm"
            onClick={() => this.setState({ err: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * The frame every face shares: top bar, engine notice, flash, the note pad and
 * the keyboard. The route below decides what fills the middle.
 */
export function MissionShell({ children }: { children: ReactNode }) {
  return (
    <ShellCatch>
      <MissionShellInner>{children}</MissionShellInner>
    </ShellCatch>
  );
}

function MissionShellInner({ children }: { children: ReactNode }) {
  useCapcomEngine();
  const engineError = useCapcom((s) => s.engineError);
  const flash = useCapcom((s) => s.flash);
  const hydrateSessions = useCapcom((s) => s.hydrateSessions);
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    applyTheme(readTheme());
    hydrateSessions();
  }, [hydrateSessions]);

  useEffect(() => {
    setAppNav({
      home: () => void navigate({ to: "/" }),
      classPage: (id) => void navigate({ to: "/class/$id", params: { id }, search: {} }),
      catalog: () => void navigate({ to: "/class" }),
      review: (classId) => void navigate({ to: "/review", search: classId ? { class: classId } : {} }),
    });
    return () => setAppNav(null);
  }, [navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const s = useCapcom.getState();
      if (e.key === "n" || e.key === "N") {
        const open = s.sessions.some((x) => x.id === s.liveId && !x.endedAt);
        if (!open) return;
        e.preventDefault();
        s.setJotOpen(!s.jotOpen);
        return;
      }
      if (e.key !== "Escape") return;
      // Escape peels one layer: pad → open menu → catalog / edit → review → home.
      if (s.jotOpen) {
        s.setJotOpen(false);
        e.preventDefault();
        return;
      }
      const menus = document.querySelectorAll<HTMLDetailsElement>("details.recap-menu[open]");
      if (menus.length) {
        menus.forEach((m) => (m.open = false));
        e.preventDefault();
        return;
      }
      const loc = router.state.location;
      const search = loc.search as { catalog?: true; edit?: true; class?: string };
      const classMatch = loc.pathname.match(/^\/class\/([^/]+)/);
      if (classMatch && (search.catalog || search.edit)) {
        void navigate({ to: "/class/$id", params: { id: decodeURIComponent(classMatch[1]!) }, search: {} });
        e.preventDefault();
        return;
      }
      if (loc.pathname === "/review") {
        if (search.catalog) void navigate({ to: "/review", search: search.class ? { class: search.class } : {} });
        else if (search.class) void navigate({ to: "/class/$id", params: { id: search.class }, search: {} });
        else void navigate({ to: "/class" });
        e.preventDefault();
        return;
      }
      if (loc.pathname !== "/") {
        goHomeSafe();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, router]);

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <MissionBar onArm={arm} onSafe={safe} />
      {engineError ? (
        <p className="shrink-0 border-b border-line px-4 py-2 text-sm text-hold md:px-6">{engineError}</p>
      ) : null}
      {flash ? (
        <p className="pointer-events-none fixed top-16 left-1/2 z-40 -translate-x-1/2 border border-line bg-elevated px-3 py-1.5 text-sm text-fg">
          {flash}
        </p>
      ) : null}
      {children}
      <JotPad />
    </div>
  );
}
