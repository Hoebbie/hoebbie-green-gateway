import {readCoreHealth} from './read-ha-core.mjs';
import {readMusicHealth} from './read-music-health.mjs';
// Candidate for Green's existing process and outbound connection; no listener.
export async function reportCoreHealth({token,url,headers}, request=fetch, env=process.env) {
  const [snapshot,music]=await Promise.all([readCoreHealth(token,request),readMusicHealth(env,request)]);
  const health={collected_at:snapshot.collected_at,reachable:snapshot.reachable,
    version:snapshot.components[0]?.version ?? null,music};
  const response=await request(url,{method:'POST',headers,redirect:'error',
    signal:AbortSignal.timeout(4000),body:JSON.stringify({mode:'core_health',health})});
  if (!response.ok) throw new Error('core_health_report_unavailable');
}
export function startCoreHealthReporter(options) {
  let running=false;
  const tick=async()=>{
    if(running)return;
    running=true;
    try {await reportCoreHealth(options);} catch {console.error('gateway.core_health_unavailable');}
    finally {running=false;}
  };
  void tick();
  const timer=setInterval(()=>{void tick();},60000);timer.unref?.();
  return ()=>clearInterval(timer);
}
