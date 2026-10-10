const job=process.argv[2];
if(!['outbox','cleanup'].includes(job)) throw new Error('Choose outbox or cleanup.');
const origin=new URL(process.env.APP_ORIGIN ?? '');
if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new Error('A canonical HTTPS app origin is required.');
if(!process.env.CRON_SECRET) throw new Error('Scheduler credential missing.');
try {
  const response=await fetch(new URL(`/api/cron/${job}`,origin),{method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},redirect:'error',signal:AbortSignal.timeout(90_000)});
  if(!response.ok) {await response.body?.cancel();throw new Error('Job endpoint unavailable.');}
  const result=await response.json();
  console.log(JSON.stringify({event:'scheduled_job_completed',job,result}));
} catch {
  console.error(JSON.stringify({event:'scheduled_job_failed',job}));
  process.exitCode=1;
}
