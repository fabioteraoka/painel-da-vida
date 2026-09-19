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

async function syncBillTasks(userId: string) {
  const now = new Date();
  const tenDaysFromNow = new Date(now);
  tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

  const bills = await prisma.bill.findMany({
    where: {
      userId,
      status: { in: ["NEEDS_REVIEW", "CONFIRMED", "SCHEDULED"] },
      dueDate: { not: null, lte: tenDaysFromNow },
    },
    include: { task: true },
    orderBy: { dueDate: "asc" },
  });

  for (const bill of bills) {
    if (bill.task) continue;

    const due = bill.dueDate!;
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / 86400000);
    const priority = daysUntilDue <= 3 ? "HIGH" : "MEDIUM";

    await prisma.task.create({
      data: {
        title: "Pagar " + (bill.merchant ?? bill.subject),
        description:
          (bill.responsibleType === "ME"
            ? "Conta em seu nome."
            : bill.responsibleType === "OTHER"
              ? "Conta de " + (bill.responsibleName ?? bill.responsiblePerson?.name ?? "outra pessoa") + "."
              : "Responsável pela conta precisa ser confirmado.") +
          (bill.amount !== null ? " Valor: R$ " + Number(bill.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + "." : ""),
        priority,
        dueAt: due,
        billId: bill.id,
        userId,
      },
    });
  }

  return bills.length;
}

export async function scanForUser(userId:string){
  if(!process.env.AI_GATEWAY_API_KEY)throw new Error("AI_GATEWAY_API_KEY não configurada.");
  const integration=await prisma.integration.findUnique({where:{userId_provider:{userId,provider:"GMAIL"}}});
  if(!integration?.accessToken)throw new Error("Gmail não conectado.");
  let token=integration.accessToken;
  if(integration.expiresAt&&integration.expiresAt.getTime()<Date.now()+60000){
    if(!integration.refreshToken)throw new Error("Autorização do Gmail precisa ser renovada.");
    token=await refresh(userId,integration.refreshToken);
  }
  const list=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?"+new URLSearchParams({maxResults:"50",q:"newer_than:30d"}),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(list.status===401&&integration.refreshToken){token=await refresh(userId,integration.refreshToken);return scanForUser(userId);}
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
  for(const meta of candidates.slice(0,25)){
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+meta.id+"?format=full",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!r.ok)continue;
    const full=await r.json() as GmailDetail;
    try{
      const result=await classifyBillEmail({from:header(full,"From"),subject:header(full,"Subject"),snippet:full.snippet,body:textPart(full.payload),userName:user.name ?? undefined});
      if(!result.isBill||result.confidence<0.65)continue;
      let responsiblePersonId: string | null = null;
      const responsibleType = result.responsibleType;
      if (result.responsibleName) {
        const person = await prisma.person.findFirst({
          where: { userId, active: true, name: { contains: result.responsibleName, mode: "insensitive" } },
          select: { id: true },
        });
        responsiblePersonId = person?.id ?? null;
      }
      const dueDate=result.dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)?new Date(result.dueDate+"T12:00:00"):null;
      await prisma.bill.upsert({
        where:{userId_externalEmailId:{userId,externalEmailId:full.id}},
        update:{sender:header(full,"From"),subject:header(full,"Subject"),merchant:result.merchant,amount:result.amount,dueDate,invoiceNumber:result.invoiceNumber,category:result.category,confidence:result.confidence,responsiblePersonId,responsibleType,responsibleName:result.responsibleName,paymentUrl:result.paymentUrl,pixCode:result.pixCode,barcode:result.barcode,aiReason:result.reason,emailReceivedAt:full.internalDate?new Date(Number(full.internalDate)):null,sourceUrl:"https://mail.google.com/mail/u/0/#all/"+full.id},
        create:{userId,externalEmailId:full.id,threadId:full.threadId??null,sender:header(full,"From"),subject:header(full,"Subject"),merchant:result.merchant,amount:result.amount,dueDate,invoiceNumber:result.invoiceNumber,category:result.category,confidence:result.confidence,responsiblePersonId,responsibleType,responsibleName:result.responsibleName,paymentUrl:result.paymentUrl,pixCode:result.pixCode,barcode:result.barcode,aiReason:result.reason,emailReceivedAt:full.internalDate?new Date(Number(full.internalDate)):null,sourceUrl:"https://mail.google.com/mail/u/0/#all/"+full.id}
      });
      detected++;
    }catch(e){console.error("Bill AI classification failed",full.id,e);}
  }
  const tasksCreated = await syncBillTasks(userId);
  return {scanned:candidates.length,detected,tasksCreated};
}

export async function POST(){
  try{
    const session=await auth();
    if(!session?.user?.email)return NextResponse.json({error:"Não autenticado."},{status:401});
    const user=await prisma.user.findUnique({where:{email:session.user.email},select:{id:true,name:true}});
    if(!user)return NextResponse.json({error:"Usuário não encontrado."},{status:404});
    return NextResponse.json({ok:true,...await scanForUser(user.id)});
  }catch(e){
    console.error("Bill scan failed",e);
    return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível verificar as contas."},{status:503});
  }
}
