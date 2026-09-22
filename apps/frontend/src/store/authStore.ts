import {create} from 'zustand';
import {api} from '../lib/api';

export type Role='ADMIN'|'CASHIER'|'CLIENT';
export type KycStatus='PENDING'|'VERIFIED'|'REJECTED';

export interface Customer{
  customerId:string;
  username:string;
  email:string;
  fullName:string;
  documentNumber:string;
  documentPhoto:string;
  birthDate:string;
  address:string;
  role:Role;
  identityStatus:string;
  kycStatus:KycStatus;
  status:string;
  registeredAt:string;
}

interface State{
  customer:Customer|null;
  token:string|null;
  loading:boolean;
  error:string|null;
  login:(u:string,p:string)=>Promise<void>;
  loadMe:()=>Promise<void>;
  logout:()=>void;
}

export const useAuthStore=create<State>((set)=>({
  customer:null,
  token:localStorage.getItem('token'),
  loading:false,
  error:null,

  login:async(u,p)=>{
    set({loading:true,error:null});

    try{
      const d=await api('/api/customers/login',{
        method:'POST',
        body:JSON.stringify({
          username:u,
          password:p
        })
      });

      localStorage.setItem('token',d.token);

      set({token:d.token});

      const me=await api('/api/customers/me');

      set({
        customer:me,
        loading:false
      });
    }catch(e){
      set({
        error:e instanceof Error
          ?e.message
          :String(e),
        loading:false
      });

      throw e;
    }
  },

  loadMe:async()=>{
    if(!localStorage.getItem('token')){
      return;
    }

    try{
      set({
        customer:await api('/api/customers/me')
      });
    }catch{
      // La sesión existente puede haber expirado.
    }
  },

  logout:()=>{
    localStorage.removeItem('token');

    set({
      customer:null,
      token:null
    });
  }
}));
