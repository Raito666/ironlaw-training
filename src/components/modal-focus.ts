let activation: HTMLElement | null = null;
let activationExpiry: ReturnType<typeof setTimeout> | undefined;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (event) => {
      const target = event.composedPath().find((element) => element instanceof Element);
      activation =
        target instanceof Element
          ? target.closest<HTMLElement>(
              'button, a[href], input, select, textarea, [tabindex], [role="button"]',
            )
          : null;
      clearTimeout(activationExpiry);
      // React commits a click's dialog before the next task. Do not retain an
      // unrelated old pointer target for dialogs opened later by another action.
      activationExpiry = setTimeout(() => {
        activation = null;
      }, 0);
    },
    true,
  );
}

export function modalReturnTarget(): HTMLElement | null {
  // Safari can leave activeElement at body when a pointer activates a button.
  // Keep the actual activation source without changing native pointer focus.
  if (activation?.isConnected) return activation;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
