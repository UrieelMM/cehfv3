export const TASK_CREATION_DELAY_MS = 2_000;
export const TASK_CREATION_SUCCESS_MS = 1_500;

function wait(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    function cancel() {
      clearTimeout(timer);
      resolve(false);
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(true);
    }, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** Keep one creation pending through preparation, saving and confirmation. */
export function createTaskCreationSequence() {
  let current: AbortController | undefined;

  return {
    get pending() {
      return Boolean(current);
    },
    cancel() {
      current?.abort();
    },
    async run(createTask: () => Promise<void>, onSaving: () => void, onSuccess: () => void) {
      if (current) return false;
      const attempt = new AbortController();
      current = attempt;

      try {
        const ready = await wait(TASK_CREATION_DELAY_MS, attempt.signal);

        if (!ready || attempt.signal.aborted) return false;
        onSaving();
        await createTask();
        if (attempt.signal.aborted) return false;
        onSuccess();
        const confirmed = await wait(TASK_CREATION_SUCCESS_MS, attempt.signal);
        return confirmed && !attempt.signal.aborted;
      } catch (error) {
        if (attempt.signal.aborted) return false;
        throw error;
      } finally {
        current = undefined;
      }
    },
  };
}
