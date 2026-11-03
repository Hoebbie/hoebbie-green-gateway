// Fixed GET-only checks inside Green; reuses its existing local MA options.
async function jsonResponse(response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) throw Error('invalid');
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.length; if(size>65536) throw Error('oversize'); chunks.push(Buffer.from(chunk));
  }
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('invalid');
  return value;
}
export async function readMusicHealth(env, request=fetch) {
  const base=env.MUSIC_ASSISTANT_URL?.trim(), token=env.MUSIC_ASSISTANT_ACCESS_TOKEN?.trim();
  const result=(status,version=null)=>({status,version});
  if(!base && !token) return result('not_configured');
  if(!base || !token) return result('invalid');
  let url;
  try {
    url=new URL(base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) return result('invalid');
  } catch { return result('invalid'); }
  const origin=base.replace(/\/$/,'');
  try {
    const auth=await request(origin+'/auth/me',{method:'GET',headers:{Authorization:`Bearer ${token}`},
      redirect:'error',signal:AbortSignal.timeout(4000)});
    if([401,403].includes(auth.status)) {await auth.body?.cancel();return result('permission_denied');}
    if(auth.status===404) {await auth.body?.cancel();return result('unsupported');}
    if(!auth.ok) {await auth.body?.cancel();return result('unavailable');}
    await jsonResponse(auth); // Identity stays local and is immediately discarded.
    const info=await request(origin+'/info',{method:'GET',redirect:'error',signal:AbortSignal.timeout(4000)});
    if(!info.ok) {await info.body?.cancel();return result('unsupported');}
    const value=await jsonResponse(info);
    if(typeof value.server_version!=='string'||!/^[0-9][0-9A-Za-z.+-]{0,79}$/.test(value.server_version))return result('invalid');
    return result('ok',value.server_version);
  } catch {return result('unavailable');}
}
