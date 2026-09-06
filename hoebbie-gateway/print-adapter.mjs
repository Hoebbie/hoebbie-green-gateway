import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { COLORING_ASSETS } from './print-assets.mjs';
const execute = promisify(execFile);
export const TEST_ASSET_SHA256 = '01d602f27eca7b33701fb88c74e90b1d6fa726160f70515a65e9db83d78d905e';
export const TEST_ASSET = 'test-a4-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['completed', 'failed', 'unknown', 'cancelled']);

export function printerConfig(enabled, value) {
  if (enabled !== 'true') return null;
  const u = new URL(value);
  const octets = u.hostname.split('.').map(Number);
  const local = isIP(u.hostname) === 4 && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  if (!local || !['ipp:', 'ipps:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/ipp/print' || (u.port && !['631', '443'].includes(u.port))) throw new Error('print.invalid_config');
  return { uri: u.href };
}
export function validPrintCommand(c) {
  return c && uuid.test(c.commandId) && (c.asset === TEST_ASSET || Object.hasOwn(COLORING_ASSETS, c.asset)) && typeof c.maySubmit === 'boolean' && typeof c.cancelRequested === 'boolean' && Number.isFinite(Date.parse(c.expiresAt));
}
export class PrintJournal {
  constructor(directory) { this.directory = directory; }
  path(id) { if (!uuid.test(id)) throw new Error('print.invalid_id'); return join(this.directory, `${id}.json`); }
  async get(id) {
    try {
      const entry = JSON.parse(await readFile(this.path(id), 'utf8'));
      if (entry.id !== id || !['submitting', 'submitted', ...terminal].includes(entry.status) || (entry.jobId !== undefined && (!Number.isInteger(entry.jobId) || entry.jobId < 1))) throw new Error('print.invalid_journal');
      return entry;
    } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('print.invalid_journal'); }
  }
  async put(entry) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(entry.id), tmp = `${path}.tmp`;
    const file = await open(tmp, 'w', 0o600);
    try { await file.writeFile(JSON.stringify(entry)); await file.sync(); } finally { await file.close(); }
    await rename(tmp, path);
    const dir = await open(this.directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
  }
}
function safePrintDiagnostic(value) {
  if (!value || !['validation', 'connect', 'file', 'request', 'document', 'response', 'identity'].includes(value.phase)) return null;
  const bounds = { httpStatus: [-1, 999], ippStatus: [-1, 65535], bytesAttempted: [0, 12000000], documentBytes: [0, 12000000], elapsedMs: [0, 120000] };
  const safe = { phase: value.phase };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) return null;
    safe[key] = value[key];
  }
  if (safe.bytesAttempted > safe.documentBytes) return null;
  return safe;
}
export function cupsClient({ uri, binary = '/app/print/ipp-client', assetPath = '/app/print/test-a4.pwg', prepareAsset, run = execute, log = () => {} }) {
  async function invoke(operation, name, arg) {
    // Never use a shell; only fixed operations, a validated local URI, UUID
    // job name and a fixed bundled file (or integer job ID) reach libcups.
    try {
      const { stdout } = await run(binary, [operation, uri, name, String(arg)], { timeout: 30_000, maxBuffer: 4096, env: { LANG: 'C', PATH: '/usr/bin:/bin' } });
      const value = JSON.parse(stdout);
      if (!value || typeof value !== 'object' || value.error) throw Object.assign(new Error(), { stdout });
      return value;
    } catch (error) {
      // Native stdout on failure, or the last flushed checkpoint if killed.
      // Never log raw child output, paths, URIs or printer-supplied strings.
      const sources = [error?.stdout, error?.stderr];
      let diagnostic = null;
      for (const source of sources) {
        if (typeof source !== 'string' || source.length > 4096) continue;
        for (const line of source.trim().split('\n').reverse()) {
          try { diagnostic = safePrintDiagnostic(JSON.parse(line)?.diagnostic); } catch { /* untrusted output */ }
          if (diagnostic) break;
        }
        if (diagnostic) break;
      }
      const reason = error?.killed === true ? 'process_terminated' : 'native_error';
      try { log(`print.transport:${JSON.stringify({ operation, reason, ...(diagnostic ?? { phase: 'unavailable' }) })}`); } catch { /* diagnostics cannot alter delivery state */ }
      throw new Error('print.ipp_unconfirmed');
    }
  }
  return {
    target: createHash('sha256').update(uri).digest('hex'),
    async verifyAsset(asset = TEST_ASSET) {
      const selected = asset === TEST_ASSET ? { path: assetPath, sha256: TEST_ASSET_SHA256 } : COLORING_ASSETS[asset];
      if (!selected) throw new Error('print.asset_invalid');
      if (asset !== TEST_ASSET) { if (!prepareAsset) throw new Error('print.asset_unavailable'); await prepareAsset(asset); }
      const bytes = await readFile(selected.path);
      if (createHash('sha256').update(bytes).digest('hex') !== selected.sha256) throw new Error('print.asset_invalid');
    },
    check: name => invoke('check', name, '0'),
    submit: (name, asset = TEST_ASSET) => invoke('submit', name, asset === TEST_ASSET ? assetPath : COLORING_ASSETS[asset].path),
    status: (name, id) => invoke('status', name, id),
    cancel: (name, id) => invoke('cancel', name, id)
  };
}
export class PrintAdapter {
  #active = false;
  constructor({ journal, client, now = Date.now }) { Object.assign(this, { journal, client, now }); }
  async run(command) {
    if (!validPrintCommand(command)) throw new Error('print.invalid_command');
    if (this.#active) throw new Error('print.busy');
    this.#active = true;
    try { return await this.process(command); } finally { this.#active = false; }
  }
  async process(c) {
    let entry = await this.journal.get(c.commandId);
    const save = async (status, code = null, extra = {}) => {
      entry = { ...entry, id: c.commandId, asset: c.asset, target: this.client.target, status, code, ...extra };
      await this.journal.put(entry); return { status, code, sheets: entry.sheets ?? null };
    };
    // Legacy journals only ever contained the test page. Never alias a new motif.
    if (entry && (entry.asset ?? TEST_ASSET) !== c.asset) return { status: 'unknown', code: 'job_identity_unknown', sheets: null };
    if (entry && terminal.has(entry.status)) return { status: entry.status, code: entry.code, sheets: entry.sheets ?? null };
    if (entry && entry.target !== this.client.target) return save('unknown', 'job_identity_unknown');
    if (entry?.status === 'submitting') return save('unknown', 'delivery_unknown');
    const name = `HOS-${c.commandId}`;
    if (!entry) {
      if (!c.maySubmit) return save('unknown', 'delivery_unknown');
      if (c.cancelRequested) return save('cancelled');
      if (Date.parse(c.expiresAt) <= this.now()) return save('failed', 'expired');
      try { await this.client.verifyAsset(c.asset); if ((await this.client.check(name)).ready !== true) return save('failed', 'printer_not_ready'); }
      catch { return save('failed', 'preflight_failed'); }
      // Recheck expiry after network preflight, BEFORE durable dispatch intent.
      if (Date.parse(c.expiresAt) <= this.now()) return save('failed', 'expired');
      await save('submitting');
      let submitted;
      try { submitted = await this.client.submit(name, c.asset); }
      catch { return save('unknown', 'delivery_unknown'); }
      if (!Number.isInteger(submitted.jobId) || submitted.jobId < 1) return save('unknown', 'delivery_unknown');
      // If this write fails, the previous submitting tombstone survives and
      // prevents an automatic reprint after a crash.
      await save('submitted', null, { jobId: submitted.jobId });
    }
    try {
      const current = await this.client.status(name, entry.jobId);
      if (current.jobId !== entry.jobId) return save('unknown', 'job_identity_unknown');
      if (current.state === 9) {
        if (current.sheets !== 1) return save('unknown', 'sheet_count_unconfirmed');
        return save('completed', null, { sheets: 1 });
      }
      if (current.state === 7) return save('cancelled');
      if (current.state === 8) return save('failed', 'printer_aborted');
      if (![3, 4, 5, 6].includes(current.state)) return save('unknown', 'job_state_unknown');
      if (c.cancelRequested || Date.parse(c.expiresAt) <= this.now()) {
        // Status verifies both job ID AND unique name before Cancel-Job.
        await this.client.cancel(name, entry.jobId);
        const after = await this.client.status(name, entry.jobId);
        if (after.jobId === entry.jobId && after.state === 7) return save('cancelled');
        if (after.jobId === entry.jobId && after.state === 9 && after.sheets === 1) return save('completed', null, { sheets: 1 });
        return save('unknown', 'cancel_unconfirmed');
      }
      return { status: 'submitted', code: current.state === 4 || current.state === 6 ? 'printer_waiting' : null, sheets: null };
    } catch { return save('unknown', 'status_unavailable'); }
  }
}
