// Read-only optimization; a failed hint always permits the authoritative claim.
export const queueNames = ['pilot', 'entity', 'playback', 'volume', 'group', 'transfer', 'all_rooms', 'seek', 'skip', 'shuffle', 'catalog', 'start', 'vacuum', 'print'];
export async function queueHints(session, fetcher = fetch, timeoutMs = 750) {
  if (!session || session.expiresAt * 1000 < Date.now() + timeoutMs) return null;
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const r = await fetcher(new URL('/rest/v1/rpc/gateway_queue_hints', session.supabaseUrl), {
          method: 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { apikey: session.publishableKey, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }, body: '{}'
        });
        if (!r.ok) return null;
        const value = await r.json();
        return value && queueNames.every(k => typeof value[k] === 'boolean') ? value : null;
      })(),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); })
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
