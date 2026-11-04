// Fixed Core GET only; discard device states, names, identifiers and credentials locally.
const products = new Map([
  ['core','Home Assistant Core'],['os','Home Assistant Operating System'],
  ['supervisor','Home Assistant Supervisor'],['gateway','Hoebbie Green Gateway'],
  ['music','Music Assistant']
]);
const version = v => typeof v === 'string' && /^[0-9][0-9A-Za-z.+-]{0,79}$/.test(v);
const empty = (id,status) => ({id,status,version:null,latest_version:null,update_available:null});
export function selectUpdates(states) {
  if (!Array.isArray(states) || states.length > 10000) throw Error('invalid');
  return [...products].map(([id,title])=>{
    const rows=states.filter(s=>typeof s?.entity_id==='string' && s.entity_id.startsWith('update.') && s.attributes?.title===title);
    if(rows.length!==1)return empty(id,rows.length?'ambiguous':'not_found');
    const row=rows[0],a=row.attributes;
    if(!['on','off'].includes(row.state))return empty(id,'unknown');
    if(!version(a.installed_version)||!version(a.latest_version))return empty(id,'unknown');
    const result={id,status:'current',version:a.installed_version,latest_version:a.latest_version,update_available:false};
    if(a.in_progress===true || (typeof a.in_progress==='number' && a.in_progress>0 && a.in_progress<=100))
      return {...result,status:'installing',update_available:null};
    if(a.in_progress!=null && a.in_progress!==false && a.in_progress!==0)return empty(id,'invalid');
    if(a.installed_version===a.latest_version)return row.state==='off'?result:empty(id,'invalid');
    if(a.skipped_version===a.latest_version)return {...result,status:'skipped',update_available:true};
    if(row.state==='on')return {...result,status:'available',update_available:true};
    return empty(id,'unknown');
  });
}
export async function readUpdateHealth(token,request=fetch) {
  try {
    if(typeof token!=='string'||token.length<24)throw Error('credential');
    const response=await request('http://supervisor/core/api/states',{
      method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(4000)});
    if(response.status===401||response.status===403)return [...products.keys()].map(id=>empty(id,'permission_denied'));
    if(!response.ok||!response.body)throw Error('unavailable');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>2000000)throw Error('size');chunks.push(Buffer.from(chunk));}
    return selectUpdates(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {return [...products.keys()].map(id=>empty(id,'unavailable'));}
}
