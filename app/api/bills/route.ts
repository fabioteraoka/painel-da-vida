import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  const bills = await prisma.bill.findMany({
    where: { userId: user.id, status: { not: "IGNORED" } },
    include: { paymentAccount: true, responsiblePerson: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
  return NextResponse.json(bills.map((b: any) => ({
    id:b.id,sender:b.sender,subject:b.subject,merchant:b.merchant,amount:b.amount?.toNumber?.()??b.amount??null,
    dueDate:b.dueDate?.toISOString?.()??b.dueDate??null,invoiceNumber:b.invoiceNumber,category:b.category,status:b.status,
    confidence:b.confidence,aiReason:b.aiReason,sourceUrl:b.sourceUrl,
    responsibleType:b.responsibleType,responsibleName:b.responsibleName,
    paymentUrl:b.paymentUrl,pixCode:b.pixCode,barcode:b.barcode,
    responsiblePerson:b.responsiblePerson?{id:b.responsiblePerson.id,name:b.responsiblePerson.name,relation:b.responsiblePerson.relation}:null,
    paymentAccount:b.paymentAccount?{id:b.paymentAccount.id,name:b.paymentAccount.name,type:b.paymentAccount.type}:null
  })));
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json() as { id?:string; paymentAccountId?:string|null; responsiblePersonId?:string|null; responsibleType?:"ME"|"OTHER"|"UNKNOWN"; status?:"NEEDS_REVIEW"|"CONFIRMED"|"SCHEDULED"|"PAID"|"IGNORED" };
  if (!body.id) return NextResponse.json({ error:"Conta não informada." }, {status:400});
  const user=await prisma.user.findUnique({where:{email:session.user.email},select:{id:true}});
  if(!user) return NextResponse.json({error:"Usuário não encontrado."},{status:404});
  const bill=await prisma.bill.findFirst({where:{id:body.id,userId:user.id}});
  if(!bill) return NextResponse.json({error:"Conta não encontrada."},{status:404});
  if(body.responsiblePersonId){
    const person=await prisma.person.findFirst({where:{id:body.responsiblePersonId,userId:user.id,active:true},select:{id:true}});
    if(!person) return NextResponse.json({error:"Pessoa responsável inválida."},{status:400});
  }
  if(body.paymentAccountId){
    const account=await prisma.paymentAccount.findFirst({where:{id:body.paymentAccountId,userId:user.id,active:true},select:{id:true}});
    if(!account) return NextResponse.json({error:"Conta de pagamento inválida."},{status:400});
  }
  if(body.responsibleType==="OTHER" && !body.responsiblePersonId && !bill.responsiblePersonId){
    return NextResponse.json({error:"Informe a pessoa responsável pela conta."},{status:400});
  }
  const updated=await prisma.bill.update({
    where:{id:bill.id},
    data:{
      paymentAccountId:body.paymentAccountId===undefined?undefined:body.paymentAccountId,
      responsibleType:body.responsibleType??undefined,
      responsiblePersonId:body.responsiblePersonId===undefined?undefined:body.responsiblePersonId,
      status:body.status??undefined
    },
    include:{paymentAccount:true,responsiblePerson:true}
  });
  if(body.status==="PAID"){
    await prisma.task.updateMany({
      where:{userId:user.id,billId:updated.id},
      data:{status:"COMPLETED",completedAt:new Date()}
    });
  } else if(body.status){
    await prisma.task.updateMany({
      where:{userId:user.id,billId:updated.id},
      data:{status:"PENDING",completedAt:null}
    });
  }
  return NextResponse.json({
    id:updated.id,
    paymentAccount:updated.paymentAccount?{id:updated.paymentAccount.id,name:updated.paymentAccount.name,type:updated.paymentAccount.type}:null,
    status:updated.status,
    responsibleType:updated.responsibleType,
    responsiblePerson:updated.responsiblePerson?{id:updated.responsiblePerson.id,name:updated.responsiblePerson.name,relation:updated.responsiblePerson.relation}:null
  });
}
