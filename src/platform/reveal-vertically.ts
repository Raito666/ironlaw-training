function scrollArea(element: HTMLElement) {
  const surface = element.closest<HTMLElement>(".modal-body, .workout-view");
  if (surface && /auto|scroll/.test(getComputedStyle(surface).overflowY))
    return surface;
  return document.scrollingElement;
}

/** Scroll only the owning vertical surface, and only as far as needed. */
export function revealVertically(
  element: HTMLElement,
  top: number,
  bottom: number,
) {
  const scroller = scrollArea(element);
  if (!scroller) return;
  if (scroller !== document.scrollingElement) {
    const bounds = scroller.getBoundingClientRect();
    top = Math.max(top, bounds.top + scroller.clientTop);
    bottom = Math.min(
      bottom,
      bounds.top + scroller.clientTop + scroller.clientHeight,
    );
  }
  if (bottom <= top) return;
  const box = element.getBoundingClientRect();
  const inset = Math.min(12, Math.max(0, (bottom - top - box.height) / 2));
  const delta =
    box.height > bottom - top || box.top < top + inset
      ? box.top - top - inset
      : Math.max(0, box.bottom - bottom + inset);
  if (Math.abs(delta) > 1)
    scroller.scrollBy({ top: delta, behavior: "instant" });
}

export function revealInlineControl(element: HTMLElement) {
  const viewport = window.visualViewport;
  if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
  // Native WKWebView dialog bounds already share the visible coordinate space.
  const nativeDialog = element.closest('[data-native-platform="ios"] dialog');
  const top = nativeDialog ? 0 : (viewport?.offsetTop ?? 0);
  let bottom = top + (viewport?.height ?? window.innerHeight);
  if (scrollArea(element) === document.scrollingElement) {
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    if (
      nav?.getClientRects().length &&
      getComputedStyle(nav).visibility === "visible"
    ) {
      bottom = Math.min(bottom, nav.getBoundingClientRect().top);
    }
  }
  revealVertically(element, top, bottom);
}
