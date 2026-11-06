import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { useExiting } from "../motion/Presence";
import Icon from "./Icon";
import { modalReturnTarget } from "./modal-focus";
import { revealInlineControl } from "../platform/reveal-vertically";

export default function InlinePanel({
  title,
  children,
  footer,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  const exiting = useExiting();
  const ref = useRef<HTMLElement>(null);
  const closing = useRef(false);
  useLayoutEffect(() => {
    closing.current = exiting;
  }, [exiting]);
  useLayoutEffect(() => {
    const before = modalReturnTarget();
    const element = ref.current;
    return () => {
      const focused = document.activeElement;
      if (
        (focused === document.body ||
          (focused && element?.contains(focused))) &&
        before?.isConnected
      ) {
        before.focus({ preventScroll: true });
        if (closing.current)
          requestAnimationFrame(() => {
            if (before.isConnected && document.activeElement === before)
              revealInlineControl(before);
          });
      }
    };
  }, []);
  return (
    <section
      className="inline-task-panel"
      role="region"
      aria-labelledby={titleId}
      ref={ref}
      data-motion-state={exiting ? "exiting" : "visible"}
      inert={exiting}
      aria-hidden={exiting || undefined}
    >
      <div className="choice-inline-heading">
        <h3 id={titleId}>{title}</h3>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label={`收起${title}`}
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="inline-task-body">{children}</div>
      {footer && <div className="choice-inline-actions">{footer}</div>}
    </section>
  );
}
