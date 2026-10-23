import {useEffect,useState} from 'react';
import {Inbox,RefreshCw,ScrollText} from 'lucide-react';
import {formatDateTime} from '../lib/format';
import {Badge,CopyId,EmptyState,PageHeader,Pagination,TableWrap} from '../components/ui';
import {AuditFilters,NotificationSeverity,useAuditStore} from '../store/auditStore';
const TONES:Record<NotificationSeverity,'info'|'warning'|'danger'>={INFO:'info',WARNING:'warning',ERROR:'danger'};
const SERVICES=['customer-service','account-service','transaction-service','payment-service','notification-audit-service','api-gateway','alertmanager'];
export function AuditPage(){
  const{events,total,totalPages,isLoading,error,fetchEvents}=useAuditStore();
  const[filters,setFilters]=useState<AuditFilters>({page:0,size:20});
  useEffect(()=>{const timer=setTimeout(()=>void fetchEvents(filters),250);return()=>clearTimeout(timer);},[filters,fetchEvents]);
  const change=(key:keyof AuditFilters,value:string)=>setFilters(f=>({...f,[key]:value,page:0}));
  return <section className="page">
    <PageHeader icon={ScrollText} title="Auditoría" description="Consulta el historial por operación, traza, servicio y severidad."
      actions={<button type="button" className="secondary" onClick={()=>void fetchEvents(filters)} disabled={isLoading}><RefreshCw size={16}/>{isLoading?'Actualizando...':'Actualizar'}</button>}/>
    <div className="card filter-bar">
      <label>Buscar<input value={filters.q??''} onChange={e=>change('q',e.target.value)} placeholder="Evento u origen"/></label>
      <label>Código de seguimiento<input value={filters.correlationId??''} onChange={e=>change('correlationId',e.target.value)} placeholder="correlationId" maxLength={128}/></label>
      <label>Traza<input value={filters.traceId??''} onChange={e=>change('traceId',e.target.value.trim())} placeholder="traceId (32 caracteres)" maxLength={32}/></label>
      <label>Servicio<select value={filters.service??''} onChange={e=>change('service',e.target.value)}><option value="">Todos</option>{SERVICES.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Severidad<select value={filters.level??''} onChange={e=>change('level',e.target.value)}><option value="">Todas</option>{Object.keys(TONES).map(s=><option key={s}>{s}</option>)}</select></label>
      <button type="button" className="secondary" onClick={()=>setFilters({page:0,size:20})}>Limpiar</button>
    </div>
    {error&&<p className="alert alert-error">{error}</p>}
    {!isLoading&&events.length===0&&!error&&<EmptyState icon={Inbox}>No hay eventos que coincidan con la búsqueda.</EmptyState>}
    {events.length>0&&<>
      <TableWrap><table><thead><tr><th>Fecha</th><th>Evento / servicio</th><th>Severidad</th><th>Seguimiento / traza</th></tr></thead>
        <tbody>{events.map(e=><tr key={e.eventId}>
          <td>{formatDateTime(e.eventTimestamp??e.processedAt)}</td>
          <td><code className="event-code">{e.eventType}</code><div className="muted small">{e.serviceName??e.origin}</div>{e.message&&<div className="small">{e.message}</div>}</td>
          <td>{e.severity?<Badge tone={TONES[e.severity]}>{e.severity}</Badge>:'—'}</td>
          <td><div className="row-actions"><CopyId value={e.correlationId}/><button type="button" className="secondary" onClick={()=>change('correlationId',e.correlationId)}>Ver flujo</button></div>
            {e.traceId?<div className="row-actions"><CopyId value={e.traceId}/><button type="button" className="secondary" onClick={()=>change('traceId',e.traceId!)}>Ver traza</button></div>:<span className="muted small">Sin traza histórica</span>}</td>
        </tr>)}</tbody></table></TableWrap>
      <Pagination page={(filters.page??0)+1} totalPages={Math.max(1,totalPages)} total={total} noun="eventos" onChange={page=>setFilters(f=>({...f,page:page-1}))}/>
    </>}
  </section>;
}
