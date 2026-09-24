import {useEffect,useState} from 'react';import{Link}from'react-router-dom';import{api}from'../lib/api';import{useAuthStore}from'../store/authStore';

export function AccountsPage(){
  const{customer}=useAuthStore();
  const[a,setA]=useState<any[]>([]);
  const[type,setType]=useState('MONETARY');
  const[initial,setInitial]=useState(1000);
  const[minBalance,setMinBalance]=useState('');
  const[feeAmount,setFeeAmount]=useState('');
  const[customerId,setCustomerId]=useState('');

  const load=()=>api(`/api/accounts${customer?.role==='CLIENT'?'':customerId?`?customerId=${customerId}`:''}`).then(setA);
  useEffect(()=>{if(customer)load()},[customer]);

  const create=async()=>{
    const body:any={type,initialBalance:initial,customerId:customerId||undefined};
    if(minBalance!=='')body.minBalance=Number(minBalance);
    if(feeAmount!=='')body.feeAmount=Number(feeAmount);
    await api('/api/accounts',{method:'POST',body:JSON.stringify(body)});
    setMinBalance('');setFeeAmount('');
    load();
  };

  return <section className="page">
    <h1>Cuentas</h1>
    {customer?.role!=='CLIENT'&&<input placeholder="customerId para consultar/crear" value={customerId} onChange={e=>setCustomerId(e.target.value)}/>}
    <div className="toolbar">
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="MONETARY">Monetaria (corriente)</option>
        <option value="SAVINGS">Ahorro</option>
      </select>
      <input type="number" value={initial} onChange={e=>setInitial(Number(e.target.value))} placeholder="Saldo inicial"/>
      <input type="number" value={minBalance} onChange={e=>setMinBalance(e.target.value)} placeholder={type==='SAVINGS'?'Saldo mínimo (def. 50)':'Saldo mínimo (def. 0)'}/>
      <input type="number" value={feeAmount} onChange={e=>setFeeAmount(e.target.value)} placeholder="Comisión (opcional)"/>
      <button onClick={create}>Crear cuenta</button>
    </div>
    <table>
      <thead>
        <tr><th>ID</th><th>Tipo</th><th>Saldo</th><th>Reservado</th><th>Disponible</th><th>Saldo mínimo</th><th>Comisión</th><th>Estado</th><th></th></tr>
      </thead>
      <tbody>
        {a.map(x=><tr key={x.accountId}>
          <td>{x.accountId}</td>
          <td>{x.type==='SAVINGS'?'Ahorro':'Monetaria'}</td>
          <td>Q{x.balance}</td>
          <td>Q{x.reservedBalance}</td>
          <td>Q{x.availableBalance}</td>
          <td>Q{x.minBalance}</td>
          <td>{x.feeAmount!=null?`Q${x.feeAmount}`:'—'}</td>
          <td>{x.status}</td>
          <td><Link to={`/transactions?accountId=${x.accountId}`}>Ver historial</Link></td>
        </tr>)}
      </tbody>
    </table>
  </section>
}
