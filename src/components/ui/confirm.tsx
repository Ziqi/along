import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * The one question before something that cannot be undone. Cancel takes
 * focus first, so Enter on a reflex does nothing.
 */
export function Confirm({
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet role="alertdialog" label={title} onClose={onCancel}>
      <p className="text-lg font-medium tracking-tight text-fg">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="quiet" size="lg" onClick={onCancel} data-autofocus>
          取消
        </Button>
        <Button type="button" variant={danger ? "danger" : "primary"} size="lg" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
