import { getEntraSessionUser } from "@/lib/auth/session";
import * as teams from "@/lib/db/repositories/teams";
import { normalizeInviteEmail,isMemberRole,type MemberRole } from "@/lib/teams";
import { getAppUrl } from "@/lib/config";
import { isEmailConfigured,sendEmail } from "@/lib/email/resend";
import type { TeamActionResult } from "@/lib/team-actions";
import { enforceRateLimit } from "@/lib/security/rateLimit";

async function run<T>(work:(id:string)=>Promise<T>):Promise<TeamActionResult<T>> {
  const user=await getEntraSessionUser();
  if(!user) return {ok:false,error:"Sign in first."};
  try{return {ok:true,...await work(user.id)};}
  catch(error){
    const code=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
    console.error(JSON.stringify({event:'azure_team_operation_failed',code}));
    const message=code==='P0001' && error instanceof Error ? error.message : code==='42501' ? "You do not have permission to make this change." : "Could not update the team. Please try again.";
    return {ok:false,error:message};
  }
}
export async function list(workspace:string) {
  return run(async id => {const result=await teams.readTeam(id,workspace);return {...result,invites:result.invites.map(i=>({...i,link:`${getAppUrl()}/invite/${i.id}`}))};});
}
export async function invite(args:{workspaceId:string;email:string;role:MemberRole}) {
  const email=normalizeInviteEmail(args.email);
  if(!email || !isMemberRole(args.role)) return {ok:false as const,error:"Enter a valid email address and role."};
  return run(async id => {
    if(!(await enforceRateLimit(`team-invite:${id}`,20,3600_000)).ok) throw Error("Invitation limit reached");
    const inviteId=await teams.createInvite(id,args.workspaceId,email,args.role);
    const link=`${getAppUrl()}/invite/${inviteId}`;
    let emailed=false;
    if(isEmailConfigured()) emailed=(await sendEmail({to:[email],subject:"You've been invited to a Soyl Forms workspace",
      text:`You've been invited as ${args.role}. Accept within 7 days: ${link}. Sign in using ${email}.`,
      html:`<p>You've been invited as <strong>${args.role}</strong>.</p><p><a href="${link}">Accept the invite</a> (expires in 7 days).</p>`})).ok;
    return {link,emailed};
  });
}
export async function revoke(args:{workspaceId:string;inviteId:string}) {return run(async id => {await teams.revokeInvite(id,args.workspaceId,args.inviteId);return {};});}
export async function accept(args:{inviteId:string}) {return run(async id => ({workspaceId:await teams.acceptInvite(id,args.inviteId)}));}
export async function change(args:{workspaceId:string;userId:string;role:MemberRole}) {return run(async id => {await teams.changeMember(id,args.workspaceId,args.userId,args.role);return {};});}
export async function remove(args:{workspaceId:string;userId:string}) {return run(async id => {await teams.changeMember(id,args.workspaceId,args.userId,null);return {};});}
export async function leave(args:{workspaceId:string}) {return run(async id => {await teams.changeMember(id,args.workspaceId,id,null,true);return {};});}
