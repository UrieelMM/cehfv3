export const TASK_CREATION_DELAY_MS = 1_500;

/** A single pending creation, with a cancellable pause before any writes. */
export function createTaskCreationSequence() {
  let current: AbortController | undefined;

  return {
    get pending() {
      return Boolean(current);
    },
    cancel() {
      current?.abort();
    },
    async run(createTask: () => Promise<void>, onSaving: () => void) {
      if (current) return false;
      const attempt = new AbortController();
      current = attempt;

      try {
        const ready = await new Promise<boolean>((resolve) => {
          function cancel() {
            clearTimeout(timer);
            resolve(false);
          }
          const timer = setTimeout(() => {
            attempt.signal.removeEventListener("abort", cancel);
            resolve(true);
          }, TASK_CREATION_DELAY_MS);
          attempt.signal.addEventListener("abort", cancel, { once: true });
        });

        if (!ready || attempt.signal.aborted) return false;
        onSaving();
        await createTask();
        return !attempt.signal.aborted;
      } catch (error) {
        if (attempt.signal.aborted) return false;
        throw error;
      } finally {
        current = undefined;
      }
    },
  };
}
