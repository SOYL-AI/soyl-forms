import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({token:vi.fn()}));
vi.mock('@azure/identity',()=>({ManagedIdentityCredential:class {getToken=state.token;}}));
import {sendAzureEmail,validAzureEmailEndpoint} from '@/lib/email/azure';
const endpoint='https://soyl-forms-communication.india.communication.azure.com';
const id='2b083885-bcc5-4b28-9154-088075459f54';
const mail={to:['fixture@example.test'],subject:'Test',text:'Text',html:'<p>Text</p>',idempotencyKey:'event:owners',providerOperationId:id,firstSentAt:new Date().toISOString()};
const result=(status:string)=>new Response(JSON.stringify({id,status}),{status:200});
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  vi.stubEnv('AZURE_EMAIL_ENDPOINT',endpoint);vi.stubEnv('AZURE_CLIENT_ID','identity');vi.stubEnv('EMAIL_FROM','sender@example.test');
  state.token.mockResolvedValue({token:'fixture-token'});fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('Azure email retry safety',()=>{
  it('sends a newly persisted operation before polling it, then requires provider success',async()=>{
    fetcher.mockResolvedValueOnce(new Response('{}',{status:202})).mockResolvedValueOnce(result('Succeeded'));
    expect(await sendAzureEmail({...mail,providerOperationFresh:true})).toEqual({ok:true});
    expect(fetcher.mock.calls.map(([,options])=>options.method ?? 'GET')).toEqual(['POST','GET']);
    expect(fetcher.mock.calls[0][1].headers['Operation-Id']).toBe(id);
  });
  it('does not send even a fresh operation after its repeatability window',async()=>{
    expect(await sendAzureEmail({...mail,providerOperationFresh:true,firstSentAt:new Date(Date.now()-300_000).toISOString()})).toMatchObject({ok:false,uncertain:true});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks the persisted operation and recovers a send after the SQL checkpoint was lost',async()=>{
    fetcher.mockResolvedValue(result('Succeeded'));
    expect(await sendAzureEmail({...mail,firstSentAt:new Date(Date.now()-3600_000).toISOString()})).toEqual({ok:true});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain(`/emails/operations/${id}?`);
  });
  it('replays an identical operation and repeatability timestamp across network failures',async()=>{
    const posts:RequestInit[]=[];
    fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
      if(url.includes('emails:send')) {posts.push(options);throw new Error('connection reset');}
      return new Response(null,{status:404});
    });
    expect((await sendAzureEmail(mail)).ok).toBe(false);
    expect((await sendAzureEmail(mail)).ok).toBe(false);
    expect(posts).toHaveLength(2);
    expect(posts[0].headers).toEqual(posts[1].headers);
    expect(posts[0].headers).toMatchObject({'Operation-Id':id,'Repeatability-Request-Id':id,'Repeatability-First-Sent':new Date(mail.firstSentAt).toUTCString()});
    expect(posts[0].body).toBe(posts[1].body);
  });
  it('never resends a missing operation outside the five-minute window',async()=>{
    fetcher.mockResolvedValue(new Response(null,{status:404}));
    expect(await sendAzureEmail({...mail,firstSentAt:new Date(Date.now()-300_000).toISOString()})).toMatchObject({ok:false,uncertain:true});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('waits for an accepted asynchronous operation instead of counting it as sent',async()=>{
    fetcher.mockResolvedValueOnce(new Response(null,{status:404})).mockResolvedValueOnce(new Response('{}',{status:202})).mockResolvedValueOnce(result('Running'));
    expect(await sendAzureEmail(mail)).toMatchObject({ok:false,deferred:true});
    expect(fetcher.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(1);
  });
  it('permits a new attempt only after an explicit send throttle, respecting retry-after',async()=>{
    fetcher.mockResolvedValueOnce(new Response(null,{status:404})).mockResolvedValueOnce(new Response(null,{status:429,headers:{'retry-after':'1200'}}));
    expect(await sendAzureEmail(mail)).toMatchObject({ok:false,deferred:true,rejected:true,retryAfterSeconds:1200});
  });
  it('retains the original operation when status polling is throttled',async()=>{
    fetcher.mockResolvedValue(new Response(null,{status:429}));
    const response=await sendAzureEmail(mail);
    expect(response).toMatchObject({ok:false,deferred:true});expect(response.rejected).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects unexpected operation IDs and never follows provider operation-location URLs',async()=>{
    fetcher.mockResolvedValue(new Response(JSON.stringify({id:'different',status:'Succeeded'})));
    expect(await sendAzureEmail(mail)).toMatchObject({ok:false,uncertain:true});
  });
  it('only permits HTTPS Azure communication endpoints without credentials, paths or ports',()=>{
    expect(validAzureEmailEndpoint(endpoint)).toBe(endpoint);
    for(const value of ['http://localhost','https://communication.azure.com.evil.test','https://x.communication.azure.com:444','https://user:secret@x.communication.azure.com','https://x.communication.azure.com/path']) expect(validAzureEmailEndpoint(value)).toBeNull();
  });
});
