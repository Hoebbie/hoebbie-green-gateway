// One configured peer, five fixed operations; credentials never enter OS payloads.
export const FM_STATION_URI = 'hoebbie-fm://station/live';
export const FM_MORNING_URI = 'hoebbie-fm://station/moin';
export const isFmStationUri = uri => uri === FM_STATION_URI || uri === FM_MORNING_URI;
export class HoebbieFmError extends Error {
  constructor(code) { super('Hoebbie FM konnte den Auftrag nicht bestätigen.'); this.code = code; }
}
export class HoebbieFm {
  constructor({ baseUrl = '', token = '' } = {}, fetcher = fetch) {
    this.enabled = Boolean(baseUrl && token);
    this.fetcher = fetcher; this.token = token; this.endpoint = null;
    if (baseUrl || token) {
      let url; try { url = new URL(baseUrl); } catch { throw new HoebbieFmError('hoebbie_fm.invalid_config'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || token.length < 32) throw new HoebbieFmError('hoebbie_fm.invalid_config');
      this.endpoint = new URL('/api/integrations/hoebbie-os/radio', url).href;
    }
  }
  async request(action, player, commandId, showProfile) {
    if (!this.enabled) throw new HoebbieFmError('hoebbie_fm.disabled');
    if (!['status','start','pause','resume','stop'].includes(action) || !/^[A-Za-z0-9:._/-]{1,200}$/.test(player)) throw new HoebbieFmError('hoebbie_fm.invalid_command');
    try {
      const response = await this.fetcher(this.endpoint, { method:'POST',redirect:'error',signal:AbortSignal.timeout(action === 'start' ? 40_000 : 5_000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token}`},body:JSON.stringify({action,player,...(commandId?{command_id:commandId}:{}),...(showProfile?{show_profile:showProfile}:{})}) });
      if (!response.ok) throw new Error('rejected');
      const raw = await response.text(); if (raw.length > 4096) throw new Error('oversize');
      const data = JSON.parse(raw);
      if (typeof data.ownsSource !== 'boolean' || typeof data.isPlaying !== 'boolean' || (data.ownsSource && (data.stationName !== 'Hoebbie FM' || typeof data.title !== 'string' || data.title.length > 300 || !(data.artist == null || typeof data.artist === 'string' && data.artist.length <= 300)))) throw new Error('invalid');
      return data;
    } catch { throw new HoebbieFmError('hoebbie_fm.unavailable'); }
  }
  project(snapshot, status) {
    if (!snapshot || !status.ownsSource) return snapshot;
    return {...snapshot,sourceMediaKind:'radio',stationName:'Hoebbie FM',title:status.title,artist:status.artist??null,album:null,artworkRef:null,durationSeconds:null,progressSeconds:null,nextTracks:[],isPlaying:status.isPlaying,shuffleEnabled:false};
  }
  mayBeFm(snapshot) {
    return !snapshot || (snapshot.sourceMediaKind !== 'track' && !(snapshot.sourceMediaKind === 'radio' && snapshot.stationName && snapshot.stationName !== 'Hoebbie FM'));
  }
  async enrich(snapshot) {
    if (!this.enabled || !snapshot || !this.mayBeFm(snapshot)) return snapshot;
    try { return this.project(snapshot, await this.request('status',snapshot.sourcePlayerId)); }
    catch { return {...snapshot,sourceMediaKind:'other',stationName:null}; } // never retain a stale FM claim
  }
  async start(command, music) {
    const result = await this.request('start', command.targetPlayerId, command.commandId, command.mediaUri === FM_MORNING_URI ? 'moin' : undefined);
    if (!result.ownsSource || !result.isPlaying) throw new HoebbieFmError('hoebbie_fm.start_unconfirmed');
    const snapshot = await music.queueSnapshot(command.targetPlayerId);
    if (!snapshot) throw new HoebbieFmError('hoebbie_fm.source_unconfirmed');
    music.restoreProfileQueue(command.targetPlayerId);
    return this.project(snapshot,result);
  }
  async setPlayback(command, music) {
    const observed = await this.control(command, music);
    return observed === null ? music.setPlayback(command) : observed;
  }
  async control(command, music) {
    if (!this.enabled) return null;
    if (!this.mayBeFm(await music.queueSnapshot(command.playerId))) return null;
    const state = await this.request('status',command.playerId);
    if (!state.ownsSource) return null;
    const action = command.action === 'play' ? 'resume' : command.action;
    await this.request(action, command.playerId, command.commandId);
    for (let i=0;i<5;i++) {
      const player = await music.getPlayer(command.playerId);
      if(player.isPlaying === (command.action === 'play')) return player.isPlaying;
      await new Promise(r=>setTimeout(r,250));
    }
    throw new HoebbieFmError('hoebbie_fm.control_unconfirmed');
  }
}
