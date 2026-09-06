import { PrintAdapter, PrintJournal, cupsClient, printerConfig, validPrintCommand } from './print-adapter.mjs';
export function createPrintWorker({ enabled, printerUri, gatewayUrl, headers, request, log = console.info, directory = '/data/print-journal', adapter: suppliedAdapter }) {
  let config;
  try { config = printerConfig(enabled, printerUri); } catch { log('print.disabled_invalid_config'); return { wake() {} }; }
  if (!config) return { wake() {} };
  const url = new URL('./print-pilot', gatewayUrl).href;
  const adapter = suppliedAdapter ?? new PrintAdapter({ journal: new PrintJournal(directory), client: cupsClient(config) });
  let busy = false, timer = null, outstanding = false;
  async function wake() {
    if (busy) return;
    if (timer) { clearTimeout(timer); timer = null; }
    busy = true;
    let repeat = false;
    try {
      const response = await request(url, { method: 'POST', headers, body: JSON.stringify({ mode: 'claim' }) });
      if (response.status === 204) { repeat = outstanding; return; }
      if (!response.ok) throw new Error();
      const command = await response.json();
      if (!validPrintCommand(command)) throw new Error();
      repeat = true; outstanding = true;
      const result = await adapter.run(command);
      const reported = await request(url, { method: 'POST', headers, body: JSON.stringify({ mode: 'report', commandId: command.commandId, ...result }) });
      if (!reported.ok) throw new Error();
      outstanding = result.status === 'submitted';
      log(`print.status:${result.status}`);
    } catch { log('print.worker_unavailable'); }
    finally {
      busy = false;
      // Only an actual active/recent job causes a focused retry; the existing
      // private wake-up + rare gateway reconciliation handle an idle queue.
      if (repeat) { timer = setTimeout(() => { void wake(); }, 15_000); timer.unref?.(); }
    }
  }
  return { wake };
}
