import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {
  NotificationSeverity,
  useAuditStore
} from '../store/auditStore';

type SeverityFilter='ALL'|NotificationSeverity;

function formatDate(value?:string|null){
  if(!value){
    return '-';
  }

  const date=new Date(value);

  if(Number.isNaN(date.getTime())){
    return value;
  }

  return date.toLocaleString();
}

export function NotificationsPage(){
  const{
    events,
    isLoading,
    error,
    fetchEvents
  }=useAuditStore();

  const[filter,setFilter]=
    useState<SeverityFilter>('ALL');

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

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Notificaciones</h1>
          <p className="muted">
            Eventos clasificados por Notification & Audit.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={()=>void fetchEvents()}
            disabled={isLoading}
          >
            {isLoading?'Actualizando...':'Actualizar'}
          </button>

          <Link to="/">Volver</Link>
        </div>
      </div>

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

      <div className="toolbar">
        <label>
          Severidad{' '}
          <select
            value={filter}
            onChange={e=>
              setFilter(
                e.target.value as SeverityFilter
              )
            }
          >
            <option value="ALL">Todas</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
        </label>
      </div>

      {error&&(
        <p className="error">{error}</p>
      )}

      {!isLoading&&notifications.length===0&&(
        <div className="card">
          No hay notificaciones clasificadas
          para el filtro seleccionado.
        </div>
      )}

      <div className="notification-list">
        {notifications.map(event=>(
          <article
            key={event.eventId}
            className={`notification-item severity-${event.severity?.toLowerCase()}`}
          >
            <div className="notification-header">
              <span
                className={`severity-badge severity-${event.severity?.toLowerCase()}`}
              >
                {event.severity}
              </span>

              <span className="notification-origin">
                {event.origin??'desconocido'}
              </span>

              <time>
                {formatDate(
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
    </section>
  );
}
