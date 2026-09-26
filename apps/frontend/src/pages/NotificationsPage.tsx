import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,AlertTriangle,Bell,Info,RefreshCw} from 'lucide-react';
import {EmptyState,PageHeader,Pagination,paginate} from '../components/ui';
import {formatDateTime} from '../lib/format';
import {
  NotificationSeverity,
  useAuditStore
} from '../store/auditStore';

type SeverityFilter='ALL'|NotificationSeverity;

const PAGE_SIZE=20;

const SEVERITY_ICONS={
  INFO:Info,
  WARNING:AlertTriangle,
  ERROR:AlertCircle
};

export function NotificationsPage(){
  const{
    events,
    isLoading,
    error,
    fetchEvents
  }=useAuditStore();

  const[filter,setFilter]=
    useState<SeverityFilter>('ALL');
  const[page,setPage]=useState(1);

  useEffect(()=>{
    void fetchEvents();
  },[fetchEvents]);

  /*
   * Los registros históricos de Fase 1 no tienen
   * severidad. El panel de notificaciones muestra
   * únicamente eventos clasificados en Fase 2.
   */
  const notifications=useMemo(()=>{
    return events.filter(event=>{
      if(!event.severity){
        return false;
      }

      return filter==='ALL'
        ||event.severity===filter;
    });
  },[events,filter]);

  const counts=useMemo(()=>{
    return events.reduce(
      (result,event)=>{
        if(event.severity){
          result[event.severity]++;
        }

        return result;
      },
      {
        INFO:0,
        WARNING:0,
        ERROR:0
      }
    );
  },[events]);

  const current=paginate(notifications,page,PAGE_SIZE);

  return(
    <section className="page">
      <PageHeader
        icon={Bell}
        title="Notificaciones"
        description="Eventos del sistema clasificados por severidad."
        actions={(
          <button
            type="button"
            className="secondary"
            onClick={()=>void fetchEvents()}
            disabled={isLoading}
          >
            <RefreshCw size={16} aria-hidden="true"/>
            {isLoading?'Actualizando...':'Actualizar'}
          </button>
        )}
      />

      <div className="notification-summary">
        <div className="summary-card info">
          <strong>{counts.INFO}</strong>
          <span>Información</span>
        </div>

        <div className="summary-card warning">
          <strong>{counts.WARNING}</strong>
          <span>Advertencias</span>
        </div>

        <div className="summary-card error">
          <strong>{counts.ERROR}</strong>
          <span>Errores</span>
        </div>
      </div>

      <div className="card filter-bar">
        <label>
          Severidad
          <select
            value={filter}
            onChange={e=>{
              setFilter(e.target.value as SeverityFilter);
              setPage(1);
            }}
          >
            <option value="ALL">Todas</option>
            <option value="INFO">Información</option>
            <option value="WARNING">Advertencias</option>
            <option value="ERROR">Errores</option>
          </select>
        </label>
      </div>

      {error&&(
        <p className="alert alert-error">{error}</p>
      )}

      {!isLoading&&notifications.length===0&&(
        <EmptyState icon={Bell}>
          No hay notificaciones para el filtro seleccionado.
        </EmptyState>
      )}

      <div className="notification-list">
        {current.items.map(event=>(
          <article
            key={event.eventId}
            className={`notification-item severity-${event.severity?.toLowerCase()}`}
          >
            <div className="notification-header">
              <span
                className={`severity-badge severity-${event.severity?.toLowerCase()}`}
              >
                {(()=>{
                  const Icon=SEVERITY_ICONS[event.severity??'INFO'];
                  return <Icon size={13} aria-hidden="true"/>;
                })()}
                {event.severity}
              </span>

              <span className="notification-origin">
                {event.origin??'desconocido'}
              </span>

              <time>
                {formatDateTime(
                  event.eventTimestamp
                  ??event.processedAt
                )}
              </time>
            </div>

            <h3>
              {event.message
                ??event.eventType}
            </h3>

            <p className="event-type">
              {event.eventType}
            </p>

            <details>
              <summary>Detalles técnicos</summary>

              <dl className="notification-details">
                <div>
                  <dt>Event ID</dt>
                  <dd>{event.eventId}</dd>
                </div>

                <div>
                  <dt>Correlation ID</dt>
                  <dd>{event.correlationId}</dd>
                </div>
              </dl>

              <pre>
                {JSON.stringify(
                  event.payload??{},
                  null,
                  2
                )}
              </pre>
            </details>
          </article>
        ))}
      </div>

      <Pagination
        page={current.page}
        totalPages={current.totalPages}
        total={notifications.length}
        noun="notificaciones"
        onChange={p=>{
          setPage(p);
          window.scrollTo({top:0});
        }}
      />
    </section>
  );
}
