/** A hint only: any uncertainty falls back to the existing authoritative claim. */
export class GroupRecoveryProbe {
  #active = null;
  #counts = { checks: 0, skipped: 0, needed: 0, fallback: 0 };
  constructor({ getSession, claim, fetcher = fetch, now = Date.now, timeoutMs = 1_000 }) {
    this.getSession = getSession;
    this.claim = claim;
    this.fetcher = fetcher;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }
  request() {
    // Ticks are reconciliation, not commands; never build a backlog.
    if (!this.#active) this.#active = this.#run().finally(() => { this.#active = null; });
    return this.#active;
  }
  takeCounts() {
    const counts = this.#counts;
    this.#counts = { checks: 0, skipped: 0, needed: 0, fallback: 0 };
    return counts;
  }
  async #run() {
    this.#counts.checks++;
    let needed;
    const session = this.getSession();
    if (session && session.expiresAt * 1_000 > this.now() + this.timeoutMs) {
      const controller = new AbortController();
      let timer;
      try {
        // Race includes parsing and aborts the transport on deadline.
        needed = await Promise.race([
          (async () => {
            const response = await this.fetcher(new URL('/rest/v1/rpc/gateway_music_group_recovery_needed', session.supabaseUrl), {
              method: 'POST', cache: 'no-store', redirect: 'error',
              headers: { apikey: session.publishableKey, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
              body: '{}', signal: controller.signal
            });
            if (!response.ok) throw new Error('probe_unavailable');
            const value = await response.json();
            if (typeof value !== 'boolean') throw new Error('probe_invalid');
            return value;
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('probe_timeout')); }, this.timeoutMs); })
        ]);
      } catch { /* Never log a response, token, URL or remote exception. */ }
      finally { clearTimeout(timer); }
    }
    if (needed === false) { this.#counts.skipped++; return; }
    if (needed === true) this.#counts.needed++;
    else this.#counts.fallback++;
    await this.claim();
  }
}
