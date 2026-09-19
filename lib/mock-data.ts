export type TaskPriority="Alta"|"Média"|"Baixa";
export type Task={id:number;title:string;description?:string;priority:TaskPriority;due:string;completed:boolean};
export type CalendarEvent={id:number;time:string;endTime:string;title:string;description:string;location?:string;type:"work"|"personal"};
export type Email={id:number;sender:string;senderEmail:string;subject:string;preview:string;time:string;category:"Responder hoje"|"Acompanhar"|"Informativo";unread:boolean};
export type Alert={id:number;title:string;description:string;type:"warning"|"danger"|"info"};

export const calendarEvents:CalendarEvent[]=[
{id:1,time:"08:30",endTime:"09:30",title:"Projeto MOMQ",description:"Reunião de acompanhamento do projeto.",location:"Teams",type:"work"},
{id:2,time:"11:00",endTime:"12:00",title:"Suprimentos",description:"Alinhamento de materiais e fornecedores.",location:"Teams",type:"work"},
{id:3,time:"15:30",endTime:"16:00",title:"Documentação",description:"Revisar documentação pendente.",type:"work"},
{id:4,time:"18:00",endTime:"19:00",title:"Compromisso pessoal",description:"Compromisso pessoal.",type:"personal"}];

export const initialTasks:Task[]=[
{id:1,title:"Revisar manual PTN",description:"Conferir os últimos ajustes.",priority:"Alta",due:"Hoje",completed:false},
{id:2,title:"Enviar documentação",description:"Enviar documentos pendentes.",priority:"Alta",due:"Hoje",completed:false},
{id:3,title:"Responder fornecedor",description:"Retornar posição sobre o material.",priority:"Média",due:"Hoje",completed:false},
{id:4,title:"Atualizar controles",description:"Atualizar planilha de acompanhamento.",priority:"Média",due:"Amanhã",completed:false},
{id:5,title:"Planejar próxima semana",description:"Organizar prioridades.",priority:"Baixa",due:"Sexta",completed:false},
{id:6,title:"Arquivar documentos antigos",description:"Organizar documentos.",priority:"Baixa",due:"Sexta",completed:true},
{id:7,title:"Conferir agenda",description:"Verificar compromissos da semana.",priority:"Baixa",due:"Hoje",completed:false}];

export const emails:Email[]=[
{id:1,sender:"Arthur",senderEmail:"arthur@empresa.com",subject:"Ajustes no manual PTN",preview:"Segue a versão atualizada para sua avaliação...",time:"08:12",category:"Responder hoje",unread:true},
{id:2,sender:"Thais",senderEmail:"thais@empresa.com",subject:"Documentação pendente",preview:"Precisamos confirmar o recebimento dos documentos...",time:"09:04",category:"Responder hoje",unread:true},
{id:3,sender:"Fornecedor ABC",senderEmail:"contato@fornecedor.com",subject:"Previsão de entrega",preview:"Gostaríamos de atualizar a previsão...",time:"10:22",category:"Acompanhar",unread:false},
{id:4,sender:"LinkedIn",senderEmail:"notifications@linkedin.com",subject:"Você tem novas notificações",preview:"Confira suas novas notificações profissionais.",time:"11:15",category:"Informativo",unread:false}];

export const alerts:Alert[]=[
{id:1,title:"Prazo se aproximando",description:"Uma tarefa importante vence hoje.",type:"warning"},
{id:2,title:"E-mail aguardando resposta",description:"Há 2 mensagens que precisam de atenção hoje.",type:"danger"},
{id:3,title:"Agenda cheia à tarde",description:"Você possui compromissos próximos entre 15h e 19h.",type:"info"}];