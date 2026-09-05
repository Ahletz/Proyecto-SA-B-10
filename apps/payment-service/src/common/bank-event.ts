export interface BankEvent<T=unknown>{eventId:string;eventType:string;version:number;timestamp:string;correlationId:string;payload:T;}
