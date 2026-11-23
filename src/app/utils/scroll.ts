/** First ancestor that scrolls vertically (`overflow-y: auto|scroll` and content taller than the box). */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

/**
 * Scrolls the element to the middle of its scrolling container, and only that container.
 * `element.scrollIntoView()` is not used on purpose: it also scrolls every `overflow: hidden`
 * ancestor (the page shell, panels), which pushes the header out of the window for good.
 */
export function scrollToCenter(element: HTMLElement | null, behavior: ScrollBehavior = 'smooth'): void {
  const container = element && scrollParent(element);
  if (!element || !container) return;
  const box = element.getBoundingClientRect();
  const containerBox = container.getBoundingClientRect();
  const top = container.scrollTop + (box.top - containerBox.top) - (container.clientHeight - box.height) / 2;
  container.scrollTo({ top: Math.max(0, top), behavior });
}
