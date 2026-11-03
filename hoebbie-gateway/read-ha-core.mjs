// Prepared for the existing Green add-on, not installed or scheduled.
// Supervisor credential stays inside that add-on. Never queries device states.
export async function readCoreHealth(token, request = fetch, now = Date.now) {
  const collected_at = now() / 1000;
  const scope = 'Home Assistant Core REST via Green Gateway';
  try {
    if (typeof token !== 'string' || token.length < 24) throw new Error('credential');
    const response = await request('http://supervisor/core/api/config', {
      method:'GET', headers:{Authorization:`Bearer ${token}`},
      redirect:'error', signal:AbortSignal.timeout(4000)
    });
    if (!response.ok || !response.body) throw new Error('unavailable');
    const chunks=[]; let size=0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1000000) throw new Error('size');
      chunks.push(Buffer.from(chunk));
    }
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data.version !== 'string' || !/^[0-9][0-9A-Za-z.+-]{0,79}$/.test(data.version))
      throw new Error('version');
    return {collected_at,scope,reachable:true,components:[{
      id:'core',name:'Home Assistant Core',status:'ok',version:data.version,
      reason:'Core-API durch das vorhandene Green-Gateway erreicht.'
    }]};
  } catch {
    return {collected_at,scope,reachable:false,components:[]};
  }
}
