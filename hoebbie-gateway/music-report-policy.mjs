// Compare observable state; retain genuine timing changes and periodic liveness.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function createMusicReportPolicy({ now = Date.now, heartbeatMs = 60_000 } = {}) {
  let inventory = null, inventoryAt = -Infinity;
  const snapshots = new Map();
  const inventoryKey = players => JSON.stringify(canonical(players.map(p => ({ ...p, groupMembers: [...(p.groupMembers ?? [])].sort() })).sort((a,b) => a.playerId.localeCompare(b.playerId))));
  function semantic(s) { const { observedAt, progressSeconds, sourceTime, ...state } = s; return JSON.stringify(canonical(state)); }
  return {
    inventoryNeeded: players => inventoryKey(players) !== inventory || now() - inventoryAt >= heartbeatMs,
    confirmInventory(players) { inventory = inventoryKey(players); inventoryAt = now(); },
    snapshotNeeded(id, s) {
      const old = snapshots.get(id);
      if (!old || now() - old.at >= heartbeatMs || old.key !== semantic(s)) return true;
      // Missing/invalid time anchors must never suppress a potentially real seek.
      const currentClock = s.sourceTime == null ? null : Date.parse(s.sourceTime);
      const oldClock = old.snapshot.sourceTime == null ? null : Date.parse(old.snapshot.sourceTime);
      if ((currentClock === null) !== (oldClock === null)) return true;
      // Progress is anchored to MA's source clock, not the HTTP observation time.
      const elapsed = currentClock === null ? 0 : (currentClock - oldClock) / 1000;
      if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(s.progressSeconds) || !Number.isFinite(old.snapshot.progressSeconds)) return true;
      let expected = old.snapshot.progressSeconds + (old.snapshot.isPlaying && currentClock !== null ? elapsed : 0);
      if (Number.isFinite(s.durationSeconds) && s.durationSeconds > 0) expected = Math.min(expected, s.durationSeconds);
      return Math.abs(s.progressSeconds - expected) > 2;
    },
    confirmSnapshot(id, snapshot) {
      // The adapter has at most eight candidate sources; keep storage bounded.
      if (snapshots.size >= 100 && !snapshots.has(id)) snapshots.clear();
      snapshots.set(id, { key: semantic(snapshot), at: now(), snapshot: { ...snapshot } });
    },
    reset() { inventory = null; inventoryAt = -Infinity; snapshots.clear(); }
  };
}
