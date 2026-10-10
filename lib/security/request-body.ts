/** Bound actual streamed bytes, including requests without Content-Length. */
export async function readBoundedText(request:Request,maximumBytes:number):Promise<string> {
  const reader=request.body?.getReader();
  if(!reader) throw new Error('Missing request body');
  const chunks:Uint8Array[]=[];let length=0;
  try {
    for(;;) {
      const part=await reader.read();if(part.done) break;
      length+=part.value.byteLength;
      if(length>maximumBytes) {await reader.cancel();throw new Error('Request body limit exceeded');}
      chunks.push(part.value);
    }
  } finally {reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
