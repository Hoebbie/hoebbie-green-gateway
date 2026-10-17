/** Transport-only counters. Never inspect bodies, headers, query strings or errors. */
export function createEdgeObservedFetch(source, fetcher = (...args) => globalThis.fetch(...args), log = entry => console.info(JSON.stringify(entry))) {
    let sequence = 0;
    return async (input, init) => {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        let name;
        try {
            name = new URL(raw).pathname.match(/^\/functions\/v1\/([a-z0-9-]+)$/)?.[1];
        }
        catch { /* Other transports are not Edge invocations. */ }
        if (!name || (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase() === "OPTIONS")
            return fetcher(input, init);
        const attempt = ++sequence, started = Date.now();
        let status = null;
        try {
            const response = await fetcher(input, init);
            status = response.status;
            return response;
        }
        finally {
            // Logging must never change the result or retry an action.
            try {
                log({ event: "edge_invocation", at: new Date().toISOString(), source, function: name, attempt, status, durationMs: Math.max(0, Date.now() - started) });
            }
            catch { /* diagnostic sink unavailable */ }
        }
    };
}
