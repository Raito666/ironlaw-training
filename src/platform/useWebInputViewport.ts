import { isCompactViewport } from "./compact-layout";
import { useEffect } from "react";
import { isIos } from "./native";
import { revealVertically } from "./reveal-vertically";

/** Browser keyboard geometry only; never changes values, saves or submits. */
export function useWebInputViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (isIos() || !viewport) return;
    const root = document.documentElement;
    let frame = 0;
    let host: HTMLElement | null = null;
    let activeField: HTMLElement | null = null;
    let visibleHeight = 0;
    const properties = ["--web-visible-height", "--web-visible-top"];
    const previous = properties.map((name) => [
      name,
      root.style.getPropertyValue(name),
    ]);

    function reset() {
      root.removeAttribute("data-web-keyboard");
      root.removeAttribute("data-web-keyboard-compact");
      host?.removeAttribute("data-web-input-active");
      host = null;
      activeField = null;
      visibleHeight = 0;
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
    }

    function update() {
      frame = 0;
      const field = document.activeElement;
      const editable =
        (field instanceof HTMLInputElement &&
          /^(text|number|search|email|tel|url)$/.test(field.type)) ||
        field instanceof HTMLTextAreaElement;
      if (
        !editable ||
        !field.isConnected ||
        field.readOnly ||
        field.disabled ||
        !isCompactViewport() ||
        Math.abs(viewport!.scale - 1) > 0.01 ||
        document.documentElement.clientHeight - viewport!.height < 120
      ) {
        reset();
        return;
      }
      const nextHost = field.closest<HTMLElement>('.main[data-page="workout"]');
      // Panning the visual viewport should not repeatedly pull the reader back to the input.
      const shouldReveal =
        activeField !== field || visibleHeight !== viewport!.height;
      activeField = field;
      visibleHeight = viewport!.height;
      if (host !== nextHost) host?.removeAttribute("data-web-input-active");
      host = nextHost;
      root.setAttribute("data-web-keyboard", "true");
      root.toggleAttribute("data-web-keyboard-compact", viewport!.height < 240);
      root.style.setProperty("--web-visible-height", `${viewport!.height}px`);
      root.style.setProperty(
        "--web-visible-top",
        `${Math.max(0, viewport!.offsetTop)}px`,
      );
      host?.setAttribute("data-web-input-active", "true");

      if (shouldReveal)
        revealVertically(
          field,
          viewport!.offsetTop,
          viewport!.offsetTop + viewport!.height,
        );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    const observer = new MutationObserver(() => {
      // A removed field may not emit blur. Unrelated live timers must not
      // pull a reader back to the focused field while they scroll a form.
      if (activeField && !activeField.isConnected) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      observer.disconnect();
      reset();
    };
  }, []);
}
