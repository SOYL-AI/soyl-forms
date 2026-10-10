import { withUserTransaction } from "@/lib/db/pool";
import { MAX_TEAM_MEMBERS, type MemberRole } from "@/lib/teams";
import type { TeamMember,TeamInvite } from "@/lib/team-actions";
export interface InviteRow {id:string;email:string;role:MemberRole;expires_at:string;accepted_at:string|null}
export async function readTeam(userId:string,workspace:string) {
  return withUserTransaction(userId,async db => (await db.query<{data:{members:TeamMember[];invites:Omit<TeamInvite,"link">[];myRole:MemberRole}}>("select platform.read_team($1) as data",[workspace])).rows[0].data);
}
export async function createInvite(userId:string,workspace:string,email:string,role:MemberRole):Promise<string> {
  return withUserTransaction(userId,async db => (await db.query<{id:string}>("select platform.create_invite($1,$2,$3,$4) as id",[workspace,email,role,MAX_TEAM_MEMBERS])).rows[0].id);
}
export async function readInvite(userId:string,id:string):Promise<InviteRow|null> {
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  return withUserTransaction(userId,async db => (await db.query<{data:InviteRow|null}>("select platform.read_invite($1) as data",[id])).rows[0].data);
}
export async function revokeInvite(userId:string,workspace:string,id:string):Promise<boolean> {
  return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>("select platform.revoke_invite($1,$2) as ok",[workspace,id])).rows[0].ok);
}
export async function acceptInvite(userId:string,id:string):Promise<string> {
  return withUserTransaction(userId,async db => (await db.query<{id:string}>("select platform.accept_invite($1,$2) as id",[id,MAX_TEAM_MEMBERS])).rows[0].id);
}
export async function changeMember(userId:string,workspace:string,target:string,role:MemberRole|null,leave=false):Promise<boolean> {
  return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>("select platform.change_member($1,$2,$3,$4) as ok",[workspace,target,role,leave])).rows[0].ok);
}
