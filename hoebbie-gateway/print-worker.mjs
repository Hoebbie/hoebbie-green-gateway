import { createPrintAssetCache } from './print-asset-cache.mjs';
import { PrintAdapter, PrintJournal, cupsClient, printerConfig, validPrintCommand } from './print-adapter.mjs';
export function createPrintWorker({ enabled, printerUri, gatewayUrl, headers, request, log = console.info, directory = '/data/print-journal', adapter: suppliedAdapter }) {
  let config;
  try { config = printerConfig(enabled, printerUri); } catch { log('print.disabled_invalid_config'); return { wake() {} }; }
  if (!config) return { wake() {} };
  const url = new URL('./print-pilot', gatewayUrl).href;
  const prepareAsset = createPrintAssetCache({ requestAsset: asset => request(url, { method: 'POST', headers, redirect: 'error', body: JSON.stringify({ mode: 'asset', asset }) }) });
  const adapter = suppliedAdapter ?? new PrintAdapter({ journal: new PrintJournal(directory), client: cupsClient({ ...config, prepareAsset }) });
  let busy = false, timer = null, outstanding = false;
  async function wake() {
    if (busy) return;
    if (timer) { clearTimeout(timer); timer = null; }
    busy = true;
    let repeat = false;
    try {
      const response = await request(url, { method: 'POST', headers, body: JSON.stringify({ mode: 'claim', catalogVersion: 'leo-v1' }) });
      if (response.status === 204) { repeat = outstanding; return; }
      if (!response.ok) throw new Error();
      const command = await response.json();
      if (!validPrintCommand(command)) throw new Error();
      repeat = true; outstanding = true;
      const result = await adapter.run(command);
      // A lost terminal report may already be committed in the cloud.
      // An empty subsequent claim must stop focused polling in that case.
      outstanding = result.status === 'submitted';
      const reported = await request(url, { method: 'POST', headers, body: JSON.stringify({ mode: 'report', commandId: command.commandId, ...result }) });
      if (!reported.ok) throw new Error();
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
