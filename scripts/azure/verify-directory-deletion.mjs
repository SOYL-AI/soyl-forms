import {setTimeout as pause} from 'node:timers/promises';
import {randomBytes,randomUUID} from 'node:crypto';
const tenant=process.env.ENTRA_TENANT_ID;
if(tenant!=='47f0c7e0-77a5-4ae0-b3b4-b9b48269d014') throw new Error('Only the dedicated SOYL Forms customer tenant is allowed.');
let id;
async function graph(path,method='GET',body) {
  const response=await fetch(`https://graph.microsoft.com/v1.0/${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body ? JSON.stringify(body) : undefined,redirect:'error',signal:AbortSignal.timeout(10_000)});
  let json=null;if(response.status!==204) {try {json=await response.json();} catch {}}
  return {status:response.status,json};
}
const credential=await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:process.env.ENTRA_CLIENT_ID,client_secret:process.env.ENTRA_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),redirect:'error',signal:AbortSignal.timeout(10_000)});
if(!credential.ok) {await credential.body?.cancel();throw new Error('Directory credential unavailable');}
const token=(await credential.json()).access_token;
try {
  const created=await graph('users','POST',{accountEnabled:true,displayName:'SOYL Forms deletion verification fixture',identities:[{signInType:'emailAddress',issuer:'soylforms.onmicrosoft.com',issuerAssignedId:`soyl-forms-qa-${randomUUID()}@example.com`}],passwordProfile:{password:`Aa9!${randomBytes(32).toString('base64url')}`,forceChangePasswordNextSignIn:false},passwordPolicies:'DisablePasswordExpiration'});
  if(created.status!==201 || !/^[0-9a-f-]{36}$/i.test(created.json?.id ?? '')) throw new Error('Could not create the isolated directory fixture');
  id=created.json.id;
  let visible;for(let n=0;n<20;n++){visible=(await graph(`users/${id}`)).status;if(visible===200)break;await pause(1000);}
  if(visible!==200) throw new Error(`Created fixture is not visible (${visible})`);
  let removed=false;
  for(let n=0;n<20;n++) {
    const deleted=await graph(`users/${id}`,'DELETE');
    if(![204,404].includes(deleted.status)) throw new Error(`Directory delete failed (${deleted.status})`);
    if((await graph(`users/${id}`)).status===404) {removed=true;break;}
    await pause(2000);
  }
  if(!removed) throw new Error('Directory deletion has not propagated');
  console.log(JSON.stringify({event:'directory_deletion_provider_verified',dedicatedTenant:true,fixtureDeleted:true,retryHandled:true,interactiveApplicationDeletionStillRequired:true}));
} catch(error) {
  console.error(JSON.stringify({event:'directory_deletion_provider_verification_failed',fixtureCreated:Boolean(id),reason:error instanceof Error ? error.message : 'Provider failure'}));process.exitCode=1;
} finally {
  // Also remove earlier interrupted fixtures, requiring our exact tag and
  // generated email pattern. Customer accounts never match this predicate.
  const listing=await graph("users?$filter=displayName%20eq%20'SOYL%20Forms%20deletion%20verification%20fixture'&$select=id,identities,createdDateTime");
  if(listing.status!==200) {console.error(JSON.stringify({event:'directory_fixture_inventory_failed',status:listing.status}));process.exitCode=1;}
  else {
    const fixtures=listing.json.value.filter(u=>u.identities?.some(i=>i.issuer==='soylforms.onmicrosoft.com' && /^soyl-forms-qa-[0-9a-f-]{36}@example\.com$/.test(i.issuerAssignedId)) && Date.parse(u.createdDateTime)>Date.now()-24*3600_000);
    let remaining=0;
    for(const fixture of fixtures) {
      let removed=false;
      for(let n=0;n<20;n++) {
        const result=await graph(`users/${fixture.id}`,'DELETE');
        if(![204,404].includes(result.status)) break;
        if((await graph(`users/${fixture.id}`)).status===404) {removed=true;break;}
        await pause(2000);
      }
      if(!removed) {remaining++;console.error(JSON.stringify({event:'directory_fixture_cleanup_required',objectId:fixture.id}));}
    }
    console.log(JSON.stringify({event:'directory_fixture_cleanup_checked',matched:fixtures.length,remaining}));
    if(remaining) process.exitCode=1;
  }
}
