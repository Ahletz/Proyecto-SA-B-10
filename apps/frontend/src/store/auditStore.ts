import {create} from 'zustand';
import {api} from '../lib/api';

export type NotificationSeverity=
  |'INFO'
  |'WARNING'
  |'ERROR';

export interface AuditEvent{
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

export interface AuditState{
  events:AuditEvent[];
  isLoading:boolean;
  error:string|null;
  fetchEvents:()=>Promise<void>;
  clearError:()=>void;
}

export const useAuditStore=create<AuditState>((set)=>({
  events:[],
  isLoading:false,
  error:null,

  fetchEvents:async()=>{
    set({
      isLoading:true,
      error:null
    });

    try{
      const data=await api('/api/audit/events');

      set({
        events:Array.isArray(data)?data:[],
        isLoading:false
      });
    }catch(err){
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
