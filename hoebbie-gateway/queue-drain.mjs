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

export async function withinDeadline(promise, milliseconds, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), milliseconds);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
