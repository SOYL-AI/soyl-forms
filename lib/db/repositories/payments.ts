import { getDatabasePool,withUserTransaction } from "@/lib/db/pool";
export interface ProviderRow {key_id:string;secret_encrypted:string;mode:string;status:string}
export interface PaymentRow {id:string;status:string;amount_paise:number;payment_id:string|null}
export async function paymentProvider(workspace:string,formId:string):Promise<ProviderRow|null> {
  return (await getDatabasePool().query<{data:ProviderRow|null}>("select platform.payment_provider($1,$2) as data",[workspace,formId])).rows[0].data;
}
export async function providerStatus(userId:string,workspace:string):Promise<{key_id:string;mode:string;updated_at:string}|null> {
  return withUserTransaction(userId,async db => (await db.query<{data:{key_id:string;mode:string;updated_at:string}|null}>("select platform.provider_status($1) as data",[workspace])).rows[0].data);
}
export async function saveProvider(userId:string,workspace:string,keyId:string|null,secret:string|null,mode:string|null):Promise<void> {
  await withUserTransaction(userId,db => db.query("select platform.save_provider($1,$2,$3,$4)",[workspace,keyId,secret,mode]));
}
export async function recordPayment(input:{workspace_id:string;form_id:string;form_version_id:string;block_id:string;order_id:string;amount_paise:number;respondent_email:string|null;currency?:string;status?:string}):Promise<void> {
  await getDatabasePool().query("select platform.record_payment($1)",[JSON.stringify(input)]);
}
export async function readPayment(form:string,order:string):Promise<PaymentRow|null> {
  return (await getDatabasePool().query<{data:PaymentRow|null}>("select platform.read_payment($1,$2) as data",[form,order])).rows[0].data;
}
export async function confirmPayment(form:string,order:string,payment:string):Promise<boolean> {
  return (await getDatabasePool().query<{ok:boolean}>("select platform.confirm_payment($1,$2,$3) as ok",[form,order,payment])).rows[0].ok;
}
