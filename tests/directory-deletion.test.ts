import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/config',()=>({getEntraConfig:()=>({tenantId:'fixture-tenant',clientId:'fixture-client',clientSecret:'fixture-secret',issuer:new URL('https://fixture.ciamlogin.com/fixture/v2.0')})}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
const provider={issuer:'https://fixture.ciamlogin.com/fixture/v2.0',objectId:'00000000-0000-4000-8000-000000000001'};
describe('Directory deletion confirmation',()=>{
  it('keeps deletion pending when DELETE returns 404 but the account can still be read',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({access_token:'fixture',expires_in:3600})).mockResolvedValueOnce(new Response(null,{status:404})).mockResolvedValueOnce(Response.json({id:provider.objectId}));
    vi.stubGlobal('fetch',fetch);
    const {deleteDirectoryUser}=await import('@/lib/auth/directory');
    await expect(deleteDirectoryUser(provider)).rejects.toThrow('not yet confirmed');
    expect(fetch.mock.calls.map(call=>call[1]?.method??'GET')).toEqual(['POST','DELETE','GET']);
  });
  it('accepts an already deleted account only when GET also confirms absence',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({access_token:'fixture',expires_in:3600})).mockResolvedValueOnce(new Response(null,{status:404})).mockResolvedValueOnce(new Response(null,{status:404})));
    const {deleteDirectoryUser}=await import('@/lib/auth/directory');
    await expect(deleteDirectoryUser(provider)).resolves.toBeUndefined();
  });
  it('rejects a different identity issuer before contacting the provider',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const {deleteDirectoryUser}=await import('@/lib/auth/directory');
    await expect(deleteDirectoryUser({...provider,issuer:'https://other.example'})).rejects.toThrow('does not match');
    expect(fetch).not.toHaveBeenCalled();
  });
});
