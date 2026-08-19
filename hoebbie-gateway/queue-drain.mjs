export class BoundedQueueDrain {
  #active = null;
  #pending = false;

  constructor({ claimOnce, maxClaims = 24, onClaimed = () => undefined, onError = () => undefined, onLimit = () => undefined }) {
    this.claimOnce = claimOnce;
    this.maxClaims = maxClaims;
    this.onClaimed = onClaimed;
    this.onError = onError;
    this.onLimit = onLimit;
  }

  request() {
    this.#pending = true;
    if (!this.#active) {
      this.#active = this.#run().finally(() => {
        this.#active = null;
        if (this.#pending) void this.request();
      });
    }
    return this.#active;
  }

  async #run() {
    // A wake-up received while a claim is running is remembered. This avoids
    // losing a command merely because a previous local request is still being
    // verified.
    while (this.#pending) {
      this.#pending = false;
      let claimed = 0;
      try {
        for (; claimed < this.maxClaims; claimed += 1) {
          if (!await this.claimOnce()) break;
        }
        if (claimed === this.maxClaims) this.onLimit();
      } catch (error) {
        this.onError(error);
      }
      if (claimed > 0) this.onClaimed(claimed);
    }
  }
}

/** Coalesces a burst of read-only refresh signals into one report. A signal
 * received while the report is running schedules exactly one follow-up, so
 * state changes are not lost and external APIs are never flooded in parallel. */
export class CoalescedAsyncTask {
  #active = null;
  #pending = false;

  constructor({ delayMilliseconds = 0, onError = () => undefined, run }) {
    this.delayMilliseconds = delayMilliseconds;
    this.onError = onError;
    this.run = run;
  }

  request() {
    this.#pending = true;
    if (!this.#active) {
      this.#active = this.#drain().finally(() => {
        this.#active = null;
        if (this.#pending) void this.request();
      });
    }
    return this.#active;
  }

  async #drain() {
    while (this.#pending) {
      if (this.delayMilliseconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMilliseconds));
      }
      // Signals received during the short debounce belong to this run. Only
      // signals arriving after it starts create the single pending follow-up.
      this.#pending = false;
      try {
        await this.run();
      } catch (error) {
        this.onError(error);
      }
    }
  }
}

export async function withinDeadline(promise, milliseconds, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(code);
          error.code = code;
          reject(error);
        }, milliseconds);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
