import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MenuCtx = createContext<{ close: (refocus?: boolean) => void } | null>(null);

function itemsIn(panel: HTMLElement | null) {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')) : [];
}

/**
 * A dropdown that behaves like one: the first item takes focus on open,
 * arrows move, Escape closes and hands focus back to the trigger, a click
 * anywhere else closes. Only one is open at a time because opening another
 * is a click elsewhere.
 */
export function Menu({
  label,
  align = "left",
  variant = "quiet",
  size = "xs",
  className,
  panelClassName,
  children,
  ...trigger
}: {
  label: ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
  children: ReactNode;
} & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    itemsIn(panel.current)[0]?.focus();
    function onDown(e: globalThis.PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      const list = itemsIn(panel.current);
      if (!list.length) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? list.length - 1
        : e.key === "ArrowDown" ? (at + 1) % list.length
        : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  }

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <Button
        ref={button}
        type="button"
        variant={variant}
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        {...trigger}
      >
        {label}
      </Button>
      {open ? (
        <div
          ref={panel}
          role="menu"
          className={cn(
            "absolute top-[calc(100%+4px)] z-40 flex min-w-40 flex-col border border-line bg-elevated p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          <MenuCtx.Provider value={{ close }}>{children}</MenuCtx.Provider>
        </div>
      ) : null}
    </div>
  );
}

/** One action in a menu; picking it closes the menu. */
export function MenuItem({
  onSelect,
  disabled,
  tone,
  className,
  children,
}: {
  onSelect: () => void;
  disabled?: boolean;
  /** `danger` reads red: the one destructive line, kept last. */
  tone?: "danger";
  className?: string;
  children: ReactNode;
}) {
  const menu = useContext(MenuCtx);
  return (
    <Button
      type="button"
      role="menuitem"
      variant="quiet"
      size="sm"
      tabIndex={-1}
      disabled={disabled}
      className={cn("w-full justify-start", tone === "danger" && "text-abort hover:text-abort", className)}
      onClick={() => {
        menu?.close();
        onSelect();
      }}
    >
      {children}
    </Button>
  );
}

/** A setting inside a menu; toggling it keeps the menu open. */
export function MenuCheck({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-sm font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" className={cn("size-3.5 border", checked ? "border-fg bg-fg" : "border-line")} />
      {children}
    </button>
  );
}

/** A link in a menu, for the few places a menu leaves the app's router. */
export function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  const menu = useContext(MenuCtx);
  return (
    <a
      href={href}
      role="menuitem"
      tabIndex={-1}
      className="flex h-8 w-full items-center px-2.5 text-sm font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
      onClick={() => menu?.close(false)}
    >
      {children}
    </a>
  );
}
