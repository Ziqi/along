import { Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { modeLabel, parseClassMode } from "@/lib/class-mode";
import type { ClassSession } from "@/lib/types";
import { formatDayTime } from "@/lib/utils";

export type CatalogStats = { classes: number; topics: number; patterns: number; words: number };

/**
 * The list of classes beside the paper. On a laptop it is always there; on a
 * phone it is a drawer (`open`), or the whole screen when no class is picked
 * (`bare`).
 */
export function RecapCatalog({
  listed,
  currentId,
  liveId,
  inClass,
  stats,
  open,
  bare,
  onPick,
  onClose,
  onStar,
  onRemove,
  onHome,
}: {
  listed: ClassSession[];
  currentId: string | null;
  liveId: string | null;
  inClass: boolean;
  stats: CatalogStats;
  open: boolean;
  bare: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
  onStar: (id: string) => void;
  onRemove: (id: string) => void;
  onHome: () => void;
}) {
  const placement = open
    ? "fixed inset-y-0 left-0 z-30 w-[min(18rem,86vw)]"
    : bare
      ? "flex w-full md:w-[min(18rem,86vw)]"
      : "hidden w-[min(18rem,86vw)] md:flex";
  return (
    <>
      {open ? (
        <button type="button" className="fixed inset-0 z-20 bg-fg/20 md:hidden" aria-label="关闭目录" onClick={onClose} />
      ) : null}
      <aside className={"recap-catalog flex shrink-0 flex-col border-r border-line bg-bg " + placement}>
        <div className="flex h-10 items-center justify-between border-b border-line px-3">
          <p className="text-sm font-medium text-fg">纪要</p>
          <Button type="button" variant="quiet" size="xs" onClick={onHome}>
            {inClass ? "回课堂" : "首页"}
          </Button>
        </div>
        <div className="border-b border-line px-3 py-3">
          <p className="text-sm text-muted">
            {stats.classes} 堂 · {stats.topics} 主题 · {stats.patterns} 句式 · {stats.words} 词
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          {listed.length ? (
            <ul>
              {listed.map((s) => (
                <li key={s.id} className="border-b border-line/60">
                  <div
                    className={"flex items-start gap-1 px-2 py-2.5 " + (s.id === currentId ? "bg-elevated" : "hover:bg-surface")}
                  >
                    <button type="button" onClick={() => onPick(s.id)} className="min-w-0 flex-1 px-1 py-0.5 text-left">
                      <span className="block text-xs text-dim">
                        {formatDayTime(s.startedAt)}
                        {" · "}
                        {modeLabel(parseClassMode(s.classMode))}
                        {s.id === liveId && !s.endedAt ? " · 进行中" : ""}
                      </span>
                      <span className="mt-1 block truncate text-base font-medium leading-snug text-fg">{s.title}</span>
                      {s.sourceTitle ? (
                        <span className="mt-0.5 block truncate text-xs text-dim">由 {s.sourceTitle} 再出</span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      aria-label={s.starred ? "取消置顶" : "置顶"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStar(s.id);
                      }}
                    >
                      <Pin className={"size-3.5 " + (s.starred ? "fill-fg text-fg" : "text-dim")} />
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      aria-label="删这份纪要"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(s.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted">上课后这里会出现进行中的纪要。</p>
          )}
        </nav>
        <SignedOut>
          <p className="recap-chrome border-t border-line px-3 py-3 text-sm text-muted">
            这台设备上的纪要只存在本机。
            <a href="/login" className="ml-1 text-fg underline decoration-fg/30 underline-offset-4">
              登录后同步
            </a>
          </p>
        </SignedOut>
      </aside>
    </>
  );
}
