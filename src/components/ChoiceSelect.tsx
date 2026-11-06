import {
  useEffect,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { InlineChoiceHost } from "./InlineChoiceScope";
import { revealInlineControl } from "../platform/reveal-vertically";
import Icon from "./Icon";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  disabled?: boolean;
}
interface Props {
  label: string;
  value: string | number;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  icon?: string;
  showLabel?: boolean;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  describedBy?: string;
  className?: string;
  searchPlaceholder?: string;
}

/** Controlled presentation only: values and writes remain owned by each feature. */
export default function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  icon = "settings",
  showLabel = false,
  active = false,
  disabled = false,
  compact = false,
  describedBy,
  className = "",
  searchPlaceholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const openedWithKeyboard = useRef(false);
  const scope = useContext(InlineChoiceHost);
  const host = scope?.current;
  const id = useId();
  const selected = options.find((option) => option.value === String(value));
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const closeAndFocus = () => {
    restoreFocus.current = true;
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    const button = trigger.current;
    if (!button?.isConnected || button.disabled) return;
    button.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === button) revealInlineControl(button);
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const begin = (keyboard: boolean) => {
    openedWithKeyboard.current = keyboard;
    document.dispatchEvent(
      new CustomEvent("ironlaw-inline-choice-open", { detail: id }),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      setOpen(false);
    };
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !trigger.current?.contains(target) &&
        !panel.current?.contains(target)
      )
        dismiss();
    };
    const another = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== id) dismiss();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
    };
    // Close after the outside click's own action, never move its target on pointerdown.
    document.addEventListener("click", outside);
    document.addEventListener("ironlaw-inline-choice-open", another);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("ironlaw-inline-choice-open", another);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, id]);
  const renderedPanel =
    open && !disabled ? (
      <ChoicePanel
        id={id}
        label={label}
        value={String(value)}
        options={options}
        panelRef={panel}
        dense={compact}
        focusOnOpen={openedWithKeyboard.current}
        searchPlaceholder={searchPlaceholder}
        onClose={closeAndFocus}
        onChoose={(next) => {
          if (!disabled) onChange(next);
          closeAndFocus();
        }}
      />
    ) : null;
  return (
    <div
      className={`choice-field ${compact ? "choice-field-compact" : ""}`}
      data-choice-open={open || undefined}
    >
      <button
        ref={trigger}
        type="button"
        className={`choice-trigger ${showLabel ? "choice-trigger-tile" : ""} ${compact ? "choice-trigger-compact" : ""} ${className}`}
        data-active={active || undefined}
        data-open={open || undefined}
        disabled={disabled}
        aria-label={`${label}：${selected?.label ?? "请选择"}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={describedBy}
        onClick={(event) => {
          if (open) closeAndFocus();
          else begin(event.detail === 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) begin(true);
            else {
              const list =
                panel.current?.querySelector<HTMLElement>('[role="listbox"]');
              const option = list?.querySelector<HTMLButtonElement>(
                '[role="option"][tabindex="0"]',
              );
              if (option) {
                option.focus({ preventScroll: true });
                revealInlineControl(option);
              }
            }
          }
        }}
      >
        <span className="choice-trigger-icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <span className="choice-trigger-copy">
          {showLabel && <span className="choice-trigger-label">{label}</span>}
          <span className="choice-trigger-value">
            <span className="choice-trigger-text" key={String(value)}>
              {selected?.label ?? "请选择"}
            </span>
          </span>
        </span>
        <span className="choice-trigger-arrow" aria-hidden="true">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      {host ? createPortal(renderedPanel, host) : renderedPanel}
    </div>
  );
}

function ChoicePanel({
  id,
  label,
  value,
  options,
  onClose,
  onChoose,
  panelRef,
  dense,
  focusOnOpen,
  searchPlaceholder,
}: {
  id: string;
  label: string;
  value: string;
  options: ChoiceOption[];
  onClose: () => void;
  onChoose: (value: string) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  dense: boolean;
  focusOnOpen: boolean;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(() =>
    Math.floor(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ) / 24,
    ),
  );
  const [focused, setFocused] = useState(value);
  const list = useRef<HTMLDivElement>(null);
  const listStart = useRef(false);
  const typeahead = useRef({ text: "", at: 0 });
  const filtered = useMemo(() => {
    const words = query
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return options.filter((option) =>
      words.every((word) =>
        `${option.label} ${option.description ?? ""}`
          .normalize("NFKC")
          .toLowerCase()
          .includes(word),
      ),
    );
  }, [options, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 24, (currentPage + 1) * 24);
  const enabled = visible.filter((option) => !option.disabled);
  const tabValue = enabled.some((option) => option.value === focused)
    ? focused
    : enabled[0]?.value;
  const focusOption = (next: string, focus = true) => {
    setFocused(next);
    const panel = list.current;
    const button =
      panel &&
      [...panel.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
        (element) => element.dataset.value === next,
      );
    if (!panel || !button) return;
    if (focus) button.focus({ preventScroll: true });
    const top = button.offsetTop;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (top + button.offsetHeight > panel.scrollTop + panel.clientHeight)
      panel.scrollTop = top + button.offsetHeight - panel.clientHeight;
    if (focus) revealInlineControl(button);
  };
  useLayoutEffect(() => {
    const initial =
      visible.find((option) => option.value === value && !option.disabled) ??
      visible.find((option) => !option.disabled);
    if (initial) focusOption(initial.value, focusOnOpen);
    if (!focusOnOpen) {
      const heading = panelRef.current?.querySelector<HTMLElement>(".choice-inline-heading");
      if (heading) revealInlineControl(heading);
    }
  }, []);
  useLayoutEffect(() => {
    if (!listStart.current) return;
    listStart.current = false;
    if (list.current) list.current.scrollTop = 0;
  }, [currentPage, query]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!enabled.length) return;
    const current = Math.max(
      0,
      enabled.findIndex((option) => option.value === focused),
    );
    let index: number | undefined;
    if (event.key === "ArrowDown") index = (current + 1) % enabled.length;
    if (event.key === "ArrowUp")
      index = (current - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = enabled.length - 1;
    if (index !== undefined) {
      event.preventDefault();
      if (enabled[index]) focusOption(enabled[index].value);
    } else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        (now - typeahead.current.at < 600 ? typeahead.current.text : "") +
        event.key.toLowerCase();
      typeahead.current = { text, at: now };
      const match = enabled.find((option) =>
        option.label.toLowerCase().startsWith(text),
      );
      if (match) {
        event.preventDefault();
        focusOption(match.value);
      }
    }
  }
  return (
    <div
      ref={panelRef}
      id={id}
      className="choice-inline-panel"
      data-ios-input-scope=""
      role="region"
      aria-labelledby={`${id}-title`}
      data-motion-state="visible"
    >
      <div className="choice-inline-heading">
        <h3 id={`${id}-title`}>{label}</h3>
        <button
          type="button"
          className="btn btn-ghost choice-collapse"
          aria-label={`收起${label}选项`}
          onClick={onClose}
        >
          收起 <Icon name="chevron-down" size={16} />
        </button>
      </div>
      <section className="choice-panel">
        <div className="choice-panel-current">
          <Icon name="check" size={18} />
          <div>
            <span>当前选择</span>
            <strong>
              {options.find((option) => option.value === value)?.label ??
                "尚未选择"}
            </strong>
          </div>
        </div>
        {(searchPlaceholder || options.length > 12) && (
          <label className="choice-search">
            <Icon name="search" size={18} />
            <span className="sr-only">搜索{label}</span>
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (enabled[0]) focusOption(enabled[0].value);
                }
              }}
              placeholder={searchPlaceholder ?? `搜索${label}…`}
              onChange={(event) => {
                listStart.current = true;
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        )}
        <div
          className={`choice-options ${dense ? "choice-options-dense" : ""}`}
          ref={list}
          role="listbox"
          aria-label={label}
          onKeyDown={navigate}
        >
          {visible.map((option, index) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              aria-label={`${option.label}${option.meta ? `，${option.meta}` : ""}`}
              aria-describedby={
                option.description
                  ? `${id}-description-${currentPage * 24 + index}`
                  : undefined
              }
              disabled={option.disabled}
              data-value={option.value}
              tabIndex={option.value === tabValue ? 0 : -1}
              onFocus={() => setFocused(option.value)}
              onClick={() => onChoose(option.value)}
              className="choice-option"
              style={
                {
                  "--choice-delay": `${Math.min(index, 4) * 16}ms`,
                } as CSSProperties
              }
            >
              <span className="choice-option-copy">
                <strong>{option.label}</strong>
                {option.description && (
                  <span id={`${id}-description-${currentPage * 24 + index}`}>
                    {option.description}
                  </span>
                )}
              </span>
              {option.meta && (
                <span className="choice-option-meta">{option.meta}</span>
              )}
              <span className="choice-option-mark" aria-hidden="true">
                {option.value === value && <Icon name="check" size={16} />}
              </span>
            </button>
          ))}
        </div>
        {pages > 1 && (
          <div
            className="choice-pagination"
            role="group"
            aria-label={`${label}选项分页`}
          >
            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage === 0}
              onClick={() => {
                listStart.current = true;
                setPage(currentPage - 1);
              }}
            >
              上一页
            </button>
            <span aria-live="polite">
              {currentPage + 1} / {pages} 页 · {filtered.length} 项
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage + 1 >= pages}
              onClick={() => {
                listStart.current = true;
                setPage(currentPage + 1);
              }}
            >
              下一页
            </button>
          </div>
        )}
        {!filtered.length && (
          <p className="choice-empty" role="status">
            没有匹配选项，换个关键词试试。
          </p>
        )}
      </section>
    </div>
  );
}
