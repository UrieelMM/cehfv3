const resizeObserverLoopMessages = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
]);

export function isResizeObserverLoopError(message: string) {
  return resizeObserverLoopMessages.has(message.trim());
}
