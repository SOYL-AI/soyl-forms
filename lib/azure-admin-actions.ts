import * as operators from '@/lib/db/repositories/operators';
import { requireAdmin,validateOverride } from '@/lib/admin';
import { platformFlagsSchema,setPlatformFlags,type PlatformFlags } from '@/lib/platform';
import type { AdminResult } from '@/app/super-admin/actions';
async function handle(work:()=>Promise<boolean>):Promise<AdminResult> {
  try {return await work() ? {ok:true} : {ok:false,error:'Record not found.'};}
  catch(error) {
    const code=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
    console.error(JSON.stringify({event:'azure_operator_action_failed',code}));
    return {ok:false,error:code==='P0001' && error instanceof Error ? error.message : 'Could not apply this change. Check your operator permissions.'};
  }
}
export function workspace(args:{workspaceId:string;status:'active'|'suspended';reason?:string}) {return handle(()=>operators.moderateWorkspace(args.workspaceId,args.status,args.reason ?? ''));}
export function form(args:{formId:string;suspend:boolean;reason?:string}) {return handle(()=>operators.moderateForm(args.formId,args.suspend,args.reason ?? ''));}
export function override(args:{workspaceId:string;plan:string;reason:string;expiresAt:string}) {
  const check=validateOverride(args);
  return check.ok ? handle(()=>operators.overridePlan(args.workspaceId,args.plan,args.reason,args.expiresAt)) : Promise.resolve(check);
}
export function clearOverride(args:{workspaceId:string}) {return handle(()=>operators.overridePlan(args.workspaceId,null,null,null));}
export async function flags(args:{flags:PlatformFlags}):Promise<AdminResult> {
  const gate=await requireAdmin();
  if(!gate.ok || gate.role!=='super_admin') return {ok:false,error:'Only super admins can change platform settings.'};
  const parsed=platformFlagsSchema.safeParse(args.flags);
  if(!parsed.success) return {ok:false,error:'Invalid settings.'};
  return handle(async()=>{await setPlatformFlags(parsed.data,gate.userId);return true;});
}
