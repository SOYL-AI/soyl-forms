import {describe,it,expect} from 'vitest';
import {readBoundedText} from '@/lib/security/request-body';

describe('provider request body limits',()=>{
  it('limits actual streamed bytes without trusting Content-Length',async()=>{
    let cancelled=false;
    const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(5));controller.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}});
    const request=new Request('https://example.test',{method:'POST',headers:{'content-length':'1'},body,duplex:'half'} as RequestInit & {duplex:'half'});
    await expect(readBoundedText(request,8)).rejects.toThrow('Request body limit exceeded');
    expect(cancelled).toBe(true);
  });
  it('preserves webhook text across multibyte chunk boundaries',async()=>{
    const encoded=new TextEncoder().encode('{"text":"₹"}');
    const body=new ReadableStream<Uint8Array>({start(controller){for(const byte of encoded) controller.enqueue(Uint8Array.of(byte));controller.close();}});
    const request=new Request('https://example.test',{method:'POST',body,duplex:'half'} as RequestInit & {duplex:'half'});
    expect(await readBoundedText(request,encoded.length)).toBe('{"text":"₹"}');
  });
});
