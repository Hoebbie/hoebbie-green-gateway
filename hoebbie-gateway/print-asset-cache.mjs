import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, readdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { COLORING_ASSETS } from './print-assets.mjs';
const maximum = 12_000_000;
export function createPrintAssetCache({ requestAsset, directory = '/data/print-assets', assets = COLORING_ASSETS, maxCacheBytes = 64_000_000 }) {
  // Only this dedicated artwork cache is evicted. Durable print-journal
  // tombstones are never removed, even if an old picture is downloaded again.
  async function prune(keep, required = 0) {
    await mkdir(directory, {recursive:true,mode:0o700});
    const entries=[];
    for (const name of await readdir(directory)) {
      if (!name.endsWith('.pwg') || !Object.hasOwn(assets,name.slice(0,-4))) continue;
      const path=join(directory,name); const info=await stat(path);
      entries.push({path,size:info.size,time:info.mtimeMs});
    }
    let total=entries.reduce((sum,e)=>sum+e.size,required);
    for (const entry of entries.sort((a,b)=>a.time-b.time)) {
      if(total<=maxCacheBytes) break;
      if(entry.path===keep) continue;
      await unlink(entry.path);total-=entry.size;
    }
    if(total>maxCacheBytes) throw new Error('print.cache_full');
  }
  const matches = (bytes, digest) => createHash('sha256').update(bytes).digest('hex') === digest;
  return async function prepareAsset(key) {
    if (!Object.hasOwn(COLORING_ASSETS, key) || !Object.hasOwn(assets, key)) throw new Error('print.asset_invalid');
    const path = join(directory, `${key}.pwg`), digest = assets[key].sha256;
    try { const info = await stat(path); if (info.size <= maximum && matches(await readFile(path), digest)) { const now=new Date(); await utimes(path,now,now); await prune(path); return path; }
      await unlink(path); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    // Fetch only this gateway's fixed print endpoint. No remote URL is accepted
    // from a command, and redirects are rejected by the gateway request helper.
    const response = await requestAsset(key);
    if (!response.ok || !response.body || response.headers.get('Content-Type')?.split(';')[0] !== 'image/pwg-raster' || Number(response.headers.get('Content-Length')) > maximum) throw new Error('print.asset_unavailable');
    const reader = response.body.getReader(), parts = []; let size = 0;
    const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 15000); timeout.unref?.();
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) { await reader.cancel(); throw new Error('print.asset_invalid'); } parts.push(value); }
    } finally { clearTimeout(timeout); reader.releaseLock(); }
    const bytes = Buffer.concat(parts);
    if (bytes.length < 1800 || !matches(bytes, digest)) throw new Error('print.asset_invalid');
    await prune(path,bytes.length);
    const tmp = `${path}.tmp`; const file = await open(tmp, 'w', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try { await rename(tmp, path); } catch (e) { await unlink(tmp).catch(() => {}); throw e; }
    const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    return path;
  };
}
