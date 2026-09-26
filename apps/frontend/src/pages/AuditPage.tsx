import {useEffect,useMemo,useState} from 'react';
import {Inbox,RefreshCw,ScrollText,Search} from 'lucide-react';
import {formatDateTime} from '../lib/format';
import {
  Badge,
  CopyId,
  EmptyState,
  PageHeader,
  Pagination,
  TableWrap,
  paginate
} from '../components/ui';
import {NotificationSeverity,useAuditStore} from '../store/auditStore';

const PAGE_SIZE=20;

const SEVERITY_TONES:Record<NotificationSeverity,'info'|'warning'|'danger'>={
  INFO:'info',
  WARNING:'warning',
  ERROR:'danger'
};

export function AuditPage(){
  const{events,isLoading,error,fetchEvents}=useAuditStore();
  const[query,setQuery]=useState('');
  const[page,setPage]=useState(1);

  useEffect(()=>{
    void fetchEvents();
  },[fetchEvents]);

  // Busca por tipo de evento, origen o correlationId (todos los eventos de un mismo flujo).
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();

    if(!q){
      return events;
    }

    return events.filter(e=>
      e.eventType.toLowerCase().includes(q)
      ||e.correlationId?.toLowerCase().includes(q)
      ||e.origin?.toLowerCase().includes(q)
    );
  },[events,query]);

  const current=paginate(filtered,page,PAGE_SIZE);

  return(
    <section className="page">
      <PageHeader
        icon={ScrollText}
        title="Auditoría"
        description="Registro de todos los eventos del sistema. Usa el código de seguimiento para ver un flujo completo."
        actions={(
          <button type="button" className="secondary" onClick={()=>void fetchEvents()} disabled={isLoading}>
            <RefreshCw size={16} aria-hidden="true"/>
            {isLoading?'Actualizando...':'Actualizar'}
          </button>
        )}
      />

      <div className="card filter-bar">
        <label className="grow">
          Buscar
          <span className="input-icon">
            <Search size={16} aria-hidden="true"/>
            <input
              value={query}
              onChange={e=>{
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tipo de evento (p. ej. payment.rejected), origen o código de seguimiento"
            />
          </span>
        </label>
      </div>

      {error&&<p className="alert alert-error">{error}</p>}

      {!isLoading&&filtered.length===0&&!error&&(
        <EmptyState icon={Inbox}>No hay eventos que coincidan con la búsqueda.</EmptyState>
      )}

      {filtered.length>0&&(
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Severidad</th>
                  <th>Código de seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map(e=>(
                  <tr key={e.eventId}>
                    <td>{formatDateTime(e.eventTimestamp??e.processedAt)}</td>
                    <td>
                      <code className="event-code">{e.eventType}</code>
                      {e.message&&<div className="muted small">{e.message}</div>}
                    </td>
                    <td>
                      {e.severity
                        ?<Badge tone={SEVERITY_TONES[e.severity]}>{e.severity}</Badge>
                        :<span className="muted">—</span>}
                    </td>
                    <td>
                      <span className="row-actions">
                        <CopyId value={e.correlationId}/>
                        <button
                          type="button"
                          className="icon-button"
                          title="Ver todos los eventos de este flujo"
                          aria-label="Filtrar por este código de seguimiento"
                          onClick={()=>{
                            setQuery(e.correlationId);
                            setPage(1);
                          }}
                        >
                          <Search size={14}/>
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <Pagination
            page={current.page}
            totalPages={current.totalPages}
            total={filtered.length}
            noun="eventos"
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
