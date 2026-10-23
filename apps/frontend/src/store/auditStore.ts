import {create} from 'zustand';
import {api} from '../lib/api';

export type NotificationSeverity=
  |'INFO'
  |'WARNING'
  |'ERROR';

export interface AuditEvent{
  traceId?:string|null;
  spanId?:string|null;
  serviceName?:string|null;
  eventId:string;
  eventType:string;
  version?:number;
  correlationId:string;
  eventTimestamp?:string|null;
  processedAt:string;
  severity?:NotificationSeverity|null;
  origin?:string|null;
  message?:string|null;
  payload?:Record<string,unknown>;
}

export interface AuditFilters{correlationId?:string;traceId?:string;service?:string;level?:string;q?:string;page?:number;size?:number;}

export interface AuditState{
  events:AuditEvent[];
  isLoading:boolean;
  error:string|null;
  total:number;
  totalPages:number;
  fetchEvents:(filters?:AuditFilters)=>Promise<void>;
  clearError:()=>void;
}

let latestRequest=0;

export const useAuditStore=create<AuditState>((set)=>({
  events:[],
  total:0,
  totalPages:0,
  isLoading:false,
  error:null,

  fetchEvents:async(filters)=>{
    const request=++latestRequest;
    set({
      isLoading:true,
      error:null
    });

    try{
      const query=new URLSearchParams();
      if(filters){
        query.set('paged','true');
        for(const[key,value]of Object.entries(filters))if(value!==undefined&&value!=='')query.set(key,String(value));
      }
      const data=await api('/api/audit/events'+(query.size?'?'+query.toString():''));
      if(request!==latestRequest)return;
      const events:Array<AuditEvent>=Array.isArray(data)?data:(Array.isArray(data.items)?data.items:[]);

      set({
        events,
        total:Array.isArray(data)?events.length:Number(data.total??0),
        totalPages:Array.isArray(data)?1:Number(data.totalPages??0),
        isLoading:false
      });
    }catch(err){
      if(request!==latestRequest)return;
      const message=
        err instanceof Error
          ?err.message
          :'Error al obtener auditoría';

      set({
        error:message,
        isLoading:false
      });
    }
  },

  clearError:()=>set({
    error:null
  })
}));
