/** Only suppress identical read-only projections, never commands or new observations.
 * A successful heartbeat still refreshes the server's availability timestamp. */
export function createProfileStatusReportPolicy({ now = Date.now, heartbeatMs = 60_000 } = {}) {
  let confirmed = null;
  let confirmedAt = -Infinity;
  return {
    shouldReport(payload) {
      return JSON.stringify(payload) !== confirmed || now() - confirmedAt >= heartbeatMs;
    },
    confirm(payload) {
      confirmed = JSON.stringify(payload);
      confirmedAt = now();
    },
  };
}
