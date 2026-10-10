import "server-only";
import { getEntraConfig } from "./config";

let credential: {token:string;expires:number} | undefined;
export async function directoryToken():Promise<string> {
  if(credential && credential.expires>Date.now()+60_000) return credential.token;
  const config=getEntraConfig();
  const response=await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,{
    method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),
    signal:AbortSignal.timeout(10_000),redirect:'error',cache:'no-store',
  });
  if(!response.ok) {await response.body?.cancel();throw new Error('Directory authentication unavailable');}
  const data=await response.json() as {access_token?:string;expires_in?:number};
  if(typeof data.access_token!=='string' || !data.expires_in || data.expires_in<60) throw new Error('Invalid directory credential');
  credential={token:data.access_token,expires:Date.now()+data.expires_in*1000};
  return credential.token;
}

/** No caller-supplied tenant, URL or email lookup. IDs come from verified OIDC claims. */
export async function deleteDirectoryUser(provider:{issuer:string;objectId:string}):Promise<void> {
  if(provider.issuer!==getEntraConfig().issuer.href || !/^[0-9a-f-]{36}$/i.test(provider.objectId)) throw new Error('Directory identity does not match this application');
  const response=await fetch(`https://graph.microsoft.com/v1.0/users/${provider.objectId}`,{
    method:'DELETE',headers:{authorization:`Bearer ${await directoryToken()}`},signal:AbortSignal.timeout(10_000),redirect:'error',cache:'no-store',
  });
  await response.body?.cancel();
  if(response.status!==204 && response.status!==404) throw new Error('Directory account deletion could not finish');
  if(response.status===404) {
    // Directory writes can briefly lag reads after account creation. A DELETE
    // 404 is not proof of absence while GET still returns the user.
    const check=await fetch(`https://graph.microsoft.com/v1.0/users/${provider.objectId}`,{
      headers:{authorization:`Bearer ${await directoryToken()}`},signal:AbortSignal.timeout(10_000),redirect:'error',cache:'no-store',
    });
    await check.body?.cancel();
    if(check.status!==404) throw new Error('Directory deletion is not yet confirmed');
  }
}
