import type { ReactNode } from "react";
import { DsButton, DsModal } from "./klaser-ds";

/** A small, styled confirmation dialog (replaces window.confirm). Primary
 * action defaults to a destructive "מחק"; the DsModal lays the action row out
 * flex-row-reverse, so the DOM-first (confirm) button sits on the far left. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "מחק",
  cancelLabel = "ביטול",
  confirmVariant = "destructive",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "destructive" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DsModal
      title={title}
      size="sm"
      onClose={onCancel}
      actions={
        <>
          <DsButton variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? "מוחק…" : confirmLabel}
          </DsButton>
          <DsButton variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </DsButton>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink">{message}</p>
    </DsModal>
  );
}
