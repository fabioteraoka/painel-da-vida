import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyBillEmail } from "@/lib/bill-ai";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type GmailMessage={id:string;threadId:string};
type GmailPart={mimeType?:string;body?:{data?:string};parts?:GmailPart[]};
type GmailDetail={id:string;threadId?:string;snippet?:string;internalDate?:string;payload?:{headers?:{name:string;value:string}[];body?:{data?:string};parts?:GmailPart[]}};

function header(m:GmailDetail,n:string){return m.payload?.headers?.find(h=>h.name.toLowerCase()===n.toLowerCase())?.value??"";}
function decode(v?:string){if(!v)return"";return Buffer.from(v.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8");}
function textPart(p?:GmailPart):string{if(!p)return"";if(p.mimeType==="text/plain"&&p.body?.data)return decode(p.body.data);return(p.parts??[]).map(textPart).join("\n");}

async function refresh(userId:string,refreshToken:string){
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.AUTH_GOOGLE_ID??"",client_secret:process.env.AUTH_GOOGLE_SECRET??"",refresh_token:refreshToken,grant_type:"refresh_token"})});
  if(!r.ok)throw new Error("Não foi possível renovar o token do Google.");
  const d=await r.json() as {access_token:string;expires_in?:number};
  await prisma.integration.update({where:{userId_provider:{userId,provider:"GMAIL"}},data:{accessToken:d.access_token,expiresAt:new Date(Date.now()+(d.expires_in??3600)*1000),status:"CONNECTED"}});
  return d.access_token;
}

async function ensureBillTask(userId:string,bill:{id:string;merchant:string|null;subject:string;amount:any;dueDate:Date|null;status:string}){
  if(!bill.dueDate || bill.status==="PAID" || bill.status==="IGNORED") return false;
  const now=new Date();
  const tenDays=new Date(now);
  tenDays.setDate(now.getDate()+10);
  if(bill.dueDate>tenDays) return false;
  const existing=await prisma.task.findUnique({where:{billId:bill.id},select:{id:true}});
  if(existing) return false;
  await prisma.task.create({
    data:{
      title:"Pagar "+(bill.merchant??bill.subject)+(bill.amount!==null?" — R$ "+Number(bill.amount).toLocaleString("pt-BR",{minimumFractionDigits:2}):""),
      description:"Conta com vencimento em "+bill.dueDate.toLocaleDateString("pt-BR")+". Abra a conta no Painel da Vida para acessar o pagamento.",
      priority:"HIGH",
      dueAt:bill.dueDate,
      userId,
      billId:bill.id,
    },
  });
  return true;
}

export async function scanForUser(userId:string){
  const integration=await prisma.integration.findUnique({where:{userId_provider:{userId,provider:"GMAIL"}}});
  if (!integration?.accessToken) {
    const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const dueSoonBills = await prisma.bill.findMany({
      where: { userId, status: { in: ["NEEDS_REVIEW", "CONFIRMED"] }, dueDate: { lte: tenDays } },
      select: { id: true, merchant: true, subject: true, amount: true, dueDate: true, status: true },
    });
    let tasksCreated = 0;
    for (const bill of dueSoonBills) {
      if (await ensureBillTask(userId, bill)) tasksCreated++;
    }
    return {
      scanned: 8,
      detected: dueSoonBills.length,
      tasksCreated,
      simulated: true,
    };
  }
  const user=await prisma.user.findUnique({where:{id:userId},select:{name:true}});
  let token=integration.accessToken;
  if(integration.expiresAt&&integration.expiresAt.getTime()<Date.now()+60000){
    if(!integration.refreshToken)throw new Error("Autorização do Gmail precisa ser renovada.");
    token=await refresh(userId,integration.refreshToken);
  }

  const list=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?"+new URLSearchParams({maxResults:"50",q:"newer_than:45d"}),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(list.status===401&&integration.refreshToken){
    token=await refresh(userId,integration.refreshToken);
    return scanForUser(userId);
  }
  if(!list.ok)throw new Error("Não foi possível consultar o Gmail.");
  const data=await list.json() as {messages?:GmailMessage[]};
  const candidates:GmailDetail[]=[];
  const keywords=["fatura","boleto","cobrança","cobranca","vencimento","conta a pagar","mensalidade","parcela","invoice","billing","payment due","pix copia e cola","código de barras","codigo de barras","energia","água","agua","internet","telefone","condomínio","condominio","seguro","imposto"];
  for(const item of data.messages??[]){
    const existing=await prisma.bill.findFirst({where:{userId,externalEmailId:item.id},select:{id:true}});
    if(existing)continue;
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+item.id+"?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!r.ok)continue;
    const d=await r.json() as GmailDetail;
    const hay=(header(d,"Subject")+" "+header(d,"From")+" "+(d.snippet??"")).toLowerCase();
    if(keywords.some(k=>hay.includes(k)))candidates.push(d);
  }

  let detected=0;
  let tasksCreated=0;
  for(const meta of candidates.slice(0,25)){
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+meta.id+"?format=full",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!r.ok)continue;
    const full=await r.json() as GmailDetail;
    try{
      const result=await classifyBillEmail({from:header(full,"From"),subject:header(full,"Subject"),snippet:full.snippet,body:textPart(full.payload),userName:user?.name ?? undefined});
      if(!result.isBill||result.confidence<0.65)continue;

      let responsiblePersonId:string|null=null;
      if(result.responsibleName){
        const person=await prisma.person.findFirst({
          where:{userId,active:true,name:{contains:result.responsibleName,mode:"insensitive"}},
          select:{id:true},
        });
        responsiblePersonId=person?.id??null;
      }

      const dueDate=result.dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)?new Date(result.dueDate+"T12:00:00"):null;
      const bill=await prisma.bill.upsert({
        where:{userId_externalEmailId:{userId,externalEmailId:full.id}},
        update:{
          sender:header(full,"From"),subject:header(full,"Subject"),merchant:result.merchant,amount:result.amount,dueDate,invoiceNumber:result.invoiceNumber,
          category:result.category,confidence:result.confidence,responsiblePersonId,responsibleType:result.responsibleType,responsibleName:result.responsibleName,
          aiReason:result.reason,emailReceivedAt:full.internalDate?new Date(Number(full.internalDate)):null,sourceUrl:"https://mail.google.com/mail/u/0/#all/"+full.id,
          paymentUrl:result.paymentUrl,pixCode:result.pixCode,barcode:result.barcode,
        },
        create:{
          userId,externalEmailId:full.id,threadId:full.threadId??null,sender:header(full,"From"),subject:header(full,"Subject"),merchant:result.merchant,amount:result.amount,dueDate,
          invoiceNumber:result.invoiceNumber,category:result.category,responsiblePersonId,responsibleType:result.responsibleType,responsibleName:result.responsibleName,
          confidence:result.confidence,aiReason:result.reason,emailReceivedAt:full.internalDate?new Date(Number(full.internalDate)):null,
          sourceUrl:"https://mail.google.com/mail/u/0/#all/"+full.id,paymentUrl:result.paymentUrl,pixCode:result.pixCode,barcode:result.barcode,
        }
      });
      detected++;
      if(await ensureBillTask(userId,bill))tasksCreated++;
    }catch(e){console.error("Bill AI classification failed",full.id,e);}
  }

  const now=new Date();
  const tenDays=new Date(now);
  tenDays.setDate(now.getDate()+10);
  const dueSoonBills=await prisma.bill.findMany({
    where:{userId,status:{notIn:["PAID","IGNORED"]},dueDate:{not:null,lte:tenDays}},
    select:{id:true,merchant:true,subject:true,amount:true,dueDate:true,status:true},
  });
  for(const bill of dueSoonBills){
    if(await ensureBillTask(userId,bill))tasksCreated++;
  }

  return {scanned:candidates.length,detected,tasksCreated};
}

export async function POST(){
  try{
    const session=await auth();
    if(!session?.user?.email)return NextResponse.json({error:"Não autenticado."},{status:401});
    const user=await prisma.user.findUnique({where:{email:session.user.email},select:{id:true}});
    if(!user)return NextResponse.json({error:"Usuário não encontrado."},{status:404});
    return NextResponse.json({ok:true,...await scanForUser(user.id)});
  }catch(e){
    console.error("Bill scan failed",e);
    return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível verificar as contas."},{status:503});
  }
}
