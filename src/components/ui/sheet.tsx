import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal panel over the page: a bottom sheet on a phone, centred on a laptop.
 * Escape and a tap on the backdrop call `onClose`; focus moves in on open
 * (to `data-autofocus`, else the first control) and back to where it was on
 * close; Tab stays inside. Escape is stopped here so the shell's keyboard
 * handler does not also peel a route layer underneath.
 */
export function Sheet({
  label,
  role = "dialog",
  onClose,
  children,
  className,
}: {
  label: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    return () => before?.focus?.();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onBackdrop(e: PointerEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      onPointerDown={onBackdrop}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto border border-line bg-elevated p-4 shadow-lg outline-none",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
