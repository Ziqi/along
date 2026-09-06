import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Box = { x: number; y: number; w: number; h: number };

function clamp(box: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(box.w, 320), Math.max(320, vw - 16));
  const h = Math.min(Math.max(box.h, 360), Math.max(360, vh - 16));
  return {
    w,
    h,
    x: Math.min(Math.max(8, box.x), Math.max(8, vw - w - 8)),
    y: Math.min(Math.max(8, box.y), Math.max(8, vh - h - 8)),
  };
}

function loadBox(key: string, fallback: Box): Box {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return clamp(fallback);
    return clamp({ ...fallback, ...(JSON.parse(raw) as Partial<Box>) });
  } catch {
    return clamp(fallback);
  }
}

export function FloatFrame({
  title,
  kicker,
  storageKey,
  onClose,
  children,
}: {
  title: string;
  kicker?: string;
  storageKey: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [box, setBox] = useState<Box>(() => {
    if (typeof window === "undefined") return { x: 24, y: 72, w: 440, h: 520 };
    return loadBox(storageKey, {
      x: Math.max(24, window.innerWidth - 468),
      y: 72,
      w: 440,
      h: 520,
    });
  });
  const drag = useRef<{
    kind: "move" | "resize";
    px: number;
    py: number;
    start: Box;
  } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(box));
    } catch {
      /* ignore */
    }
  }, [box, storageKey]);

  function onPointerMove(e: globalThis.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (d.kind === "move") {
      setBox(clamp({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    } else {
      setBox(clamp({ ...d.start, w: d.start.w + dx, h: d.start.h + dy }));
    }
  }

  function onPointerUp() {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function start(kind: "move" | "resize", e: PointerEvent) {
    e.preventDefault();
    drag.current = { kind, px: e.clientX, py: e.clientY, start: box };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div
      className="fixed z-30 flex flex-col border border-line bg-bg"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <header
        className="flex h-8 shrink-0 cursor-grab items-center gap-2 border-b border-line px-3 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          start("move", e);
        }}
      >
        {kicker ? (
          <span className="font-mono text-[10px] tracking-[0.2em] text-dim">
            {kicker}
          </span>
        ) : null}
        <h2 className="text-xs font-medium">{title}</h2>
        <div className="flex-1" />
        <Button
          type="button"
          variant="quiet"
          size="icon"
          aria-label="关闭"
          className="size-7 min-h-7 min-w-7"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <button
        type="button"
        aria-label="缩放窗口"
        className="absolute right-0 bottom-0 size-4 cursor-se-resize"
        onPointerDown={(e) => start("resize", e)}
      >
        <span className="absolute right-1 bottom-1 size-2 border-r border-b border-muted" />
      </button>
    </div>
  );
}