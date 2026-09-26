import {useEffect,useState} from 'react';import{api}from'../lib/api';

const REASON_LABELS:Record<string,string>={
  INVALID_AMOUNT:'Monto inválido',
  PAYMENT_LIMIT_EXCEEDED:'Excede el límite permitido',
  EXTERNAL_FAILURE:'Fallo del procesador externo',
  TIMEOUT:'Tiempo de espera agotado',
};

export function PaymentsPage(){
  const[p,setP]=useState<any[]>([]);
  useEffect(()=>{api('/api/payments').then(setP)},[]);
  return <section className="page">
    <h1>Pagos procesados</h1>
    <table>
      <thead><tr><th>ID</th><th>Transacción</th><th>Monto</th><th>Estado</th><th>Motivo</th><th>Fecha</th></tr></thead>
      <tbody>
        {p.map(x=><tr key={x.paymentId}>
          <td>{x.paymentId}</td>
          <td>{x.transactionId}</td>
          <td>Q{x.amount}</td>
          <td style={{color:x.status==='APPROVED'?'#16a34a':'#dc2626',fontWeight:600}}>{x.status==='APPROVED'?'Aprobado':'Rechazado'}</td>
          <td>{x.reason?(REASON_LABELS[x.reason]??x.reason):'—'}</td>
          <td>{x.createdAt?new Date(x.createdAt).toLocaleString():'—'}</td>
        </tr>)}
      </tbody>
    </table>
  </section>
}
