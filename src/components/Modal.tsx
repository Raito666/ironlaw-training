import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { useExiting } from "../motion/Presence";
import Icon from "./Icon";
import { modalReturnTarget } from "./modal-focus";
export default function Modal({
  title,
  children,
  onClose,
  footer,
  wide = false,
  id,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const before = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const exiting = useExiting();
  const releaseModal = () => {
    const dialog = ref.current;
    if (!dialog) return;
    const focused = document.activeElement as HTMLElement | null;
    const ownedFocus =
      focused === document.body ||
      focused === dialog ||
      dialog.contains(focused);
    const other = [
      ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
    ].find((element) => element !== dialog && !element.inert);
    if (dialog.open) dialog.close();
    if (!other) delete document.documentElement.dataset.modalOpen;
    if (other) {
      if (
        ownedFocus &&
        before.current?.isConnected &&
        other.contains(before.current)
      )
        before.current.focus({ preventScroll: true });
      else if (focused && other.contains(focused))
        focused.focus({ preventScroll: true });
    } else if (ownedFocus && before.current?.isConnected)
      before.current.focus({ preventScroll: true });
    else if (focused?.isConnected) focused.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    before.current = modalReturnTarget();
    const dialog = ref.current!;
    dialog.showModal();
    document.documentElement.dataset.modalOpen = "true";
    return releaseModal;
  }, []);
  useLayoutEffect(() => {
    if (!exiting) return;
    // Release native modality now; only an inert, non-modal visual remains for the exit.
    releaseModal();
    ref.current?.show();
  }, [exiting]);
  return (
    <>
      {exiting && <div className="modal-exit-shade" aria-hidden="true" />}
      <dialog
        id={id}
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""} ${className}`}
        tabIndex={-1}
        data-motion-state={exiting ? "exiting" : "visible"}
        inert={exiting}
        aria-hidden={exiting || undefined}
        onCancel={(e) => {
          e.preventDefault();
          if (!exiting) onClose();
        }}
        onClick={(e) => {
          if (!exiting && e.target === e.currentTarget) onClose();
        }}
        aria-labelledby={titleId}
      >
        <div className="modal-header" inert={exiting}>
          <h2 id={titleId} className="wrap-cjk">
            {title}
          </h2>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body" inert={exiting}>
          {children}
        </div>
        <div
          className="ios-input-accessory-slot"
          data-ios-input-accessory-slot=""
          inert={exiting}
        />
        {footer && (
          <div className="modal-footer" inert={exiting}>
            {footer}
          </div>
        )}
      </dialog>
    </>
  );
}
