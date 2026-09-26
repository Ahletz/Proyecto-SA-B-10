const API_BASE=(import.meta as any).env?.VITE_API_BASE_URL??'';
// Error HTTP con el código de estado, para distinguir p. ej. un 404 de un 500.
export class ApiError extends Error{constructor(message:string,readonly status:number){super(message);}}
export async function api(path:string, options:RequestInit={}){
  const token=localStorage.getItem('token');
  const headers=new Headers(options.headers); if(!headers.has('Content-Type'))headers.set('Content-Type','application/json'); if(token)headers.set('Authorization',`Bearer ${token}`);
  const res=await fetch(`${API_BASE}${path}`,{...options,headers}); const text=await res.text(); let data:any=text; try{data=text?JSON.parse(text):{};}catch{}
  if(!res.ok) throw new ApiError(data?.message??data?.error??(text||`HTTP ${res.status}`),res.status); return data;
}
