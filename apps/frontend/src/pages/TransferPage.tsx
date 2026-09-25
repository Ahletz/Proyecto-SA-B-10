import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
import {
  DETAILED_STATUS_LABELS,
  TransferStatus,
  createTransfer,
  failureReasonLabel,
  fetchTransferStatus,
  isTerminalStatus,
  publicStatus
} from '../lib/transactions';
import {useAuthStore} from '../store/authStore';

const POLL_INTERVAL_MS=1500;
// La Saga termina en pocos segundos; pasado este tiempo se deja de consultar.
const POLL_TIMEOUT_MS=60000;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Account{
  accountId:string;
  type:string;
  availableBalance:number|string;
  status:string;
}

type Tracking=
  |{phase:'queued'}
  |{phase:'tracking';transfer:TransferStatus}
  |{phase:'timeout';transfer:TransferStatus|null};

function accountLabel(account:Account){
  const type=account.type==='SAVINGS'?'Ahorro':'Monetaria';

  return `${type} · ${account.accountId.slice(0,8)}… · Disponible Q${Number(account.availableBalance).toFixed(2)}`;
}

// Qué puede hacer el cliente según el motivo del fallo.
function failureHelp(reason:string){
  if(reason==='KYC_NOT_VERIFIED'){
    return 'Un administrador debe verificar tu identidad antes de transferir.';
  }

  if(reason==='INSUFFICIENT_FUNDS'){
    return 'Revisa el saldo disponible y el saldo mínimo de la cuenta.';
  }

  if(reason.startsWith('PAYMENT_')){
    return 'El pago no se completó y los fondos reservados se devolvieron a tu cuenta. Puedes intentarlo de nuevo.';
  }

  return null;
}

export function TransferPage(){
  const{customer}=useAuthStore();

  const[accounts,setAccounts]=useState<Account[]>([]);
  const[sourceAccount,setSourceAccount]=useState('');
  const[targetAccount,setTargetAccount]=useState('');
  const[amount,setAmount]=useState('');

  const[isSending,setIsSending]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[correlationId,setCorrelationId]=useState<string|null>(null);
  const[tracking,setTracking]=useState<Tracking|null>(null);

  const pollTimer=useRef<number>();

  const loadAccounts=useCallback(()=>
    api('/api/accounts')
      .then((list:Account[])=>{
        const active=list.filter(account=>account.status==='ACTIVE');

        setAccounts(active);
        setSourceAccount(current=>
          current&&active.some(account=>account.accountId===current)
            ?current
            :active[0]?.accountId??''
        );
      })
      .catch(e=>setError(e instanceof Error?e.message:String(e)))
  ,[]);

  useEffect(()=>{
    void loadAccounts();
  },[loadAccounts]);

  /*
   * Seguimiento por correlationId: 404 significa que Transaction
   * todavía no consumió el evento; se consulta hasta un estado final.
   */
  useEffect(()=>{
    if(!correlationId){
      return;
    }

    const startedAt=Date.now();
    let cancelled=false;
    let last:TransferStatus|null=null;

    const poll=async()=>{
      try{
        const transfer=await fetchTransferStatus(correlationId);

        if(cancelled){
          return;
        }

        if(transfer){
          last=transfer;
          setTracking({phase:'tracking',transfer});

          if(isTerminalStatus(transfer.status)){
            void loadAccounts();
            return;
          }
        }
      }catch(e){
        if(!cancelled){
          setError(e instanceof Error?e.message:String(e));
        }
      }

      if(cancelled){
        return;
      }

      if(Date.now()-startedAt>=POLL_TIMEOUT_MS){
        setTracking({phase:'timeout',transfer:last});
        return;
      }

      pollTimer.current=window.setTimeout(poll,POLL_INTERVAL_MS);
    };

    void poll();

    return()=>{
      cancelled=true;
      window.clearTimeout(pollTimer.current);
    };
  },[correlationId,loadAccounts]);

  const amountValue=Number(amount);
  const targetValue=targetAccount.trim();
  const validationError=
    targetValue&&!UUID_PATTERN.test(targetValue)
      ?'La cuenta destino debe ser un ID de cuenta (UUID).'
      :targetValue&&targetValue===sourceAccount
        ?'La cuenta destino debe ser distinta de la de origen.'
        :amount!==''&&!(amountValue>0)
          ?'El monto debe ser mayor que cero.'
          :null;
  const canSubmit=Boolean(
    sourceAccount&&targetValue&&amount!==''&&!validationError&&!isSending
  );
  const isTracking=Boolean(correlationId)&&(
    !tracking||tracking.phase==='queued'||
    (tracking.phase==='tracking'&&!isTerminalStatus(tracking.transfer.status))
  );

  const submit=async()=>{
    setIsSending(true);
    setError(null);
    setTracking(null);
    setCorrelationId(null);

    try{
      const accepted=await createTransfer({
        sourceAccount,
        targetAccount:targetValue,
        amount:Math.round(amountValue*100)/100
      });

      setTracking({phase:'queued'});
      setCorrelationId(accepted.correlationId);
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setIsSending(false);
    }
  };

  const transfer=tracking&&tracking.phase!=='queued'?tracking.transfer:null;

  return(
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Transferir</h1>
          <p className="muted">
            La transferencia se procesa de forma asíncrona: reserva de
            fondos, pago y acreditación.
          </p>
        </div>
      </div>

      {customer&&customer.kycStatus!=='VERIFIED'&&(
        <p className="kyc-help">
          Tu identidad no está verificada (KYC {customer.kycStatus}): la
          transferencia será rechazada hasta que un administrador la verifique.
        </p>
      )}

      <div className="transfer-layout">
        <form
          className="card form"
          onSubmit={e=>{
            e.preventDefault();

            if(canSubmit){
              void submit();
            }
          }}
        >
          <label>
            Cuenta origen
            <select
              value={sourceAccount}
              onChange={e=>setSourceAccount(e.target.value)}
              disabled={accounts.length===0}
            >
              {accounts.length===0&&(
                <option value="">Sin cuentas activas</option>
              )}
              {accounts.map(account=>(
                <option key={account.accountId} value={account.accountId}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cuenta destino
            <input
              placeholder="ID de la cuenta destino"
              list="own-accounts"
              value={targetAccount}
              onChange={e=>setTargetAccount(e.target.value)}
            />
            <datalist id="own-accounts">
              {accounts
                .filter(account=>account.accountId!==sourceAccount)
                .map(account=>(
                  <option key={account.accountId} value={account.accountId}>
                    {accountLabel(account)}
                  </option>
                ))}
            </datalist>
          </label>

          <label>
            Monto (Q)
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={e=>setAmount(e.target.value)}
            />
          </label>

          {validationError&&(
            <p className="error">{validationError}</p>
          )}

          <button type="submit" disabled={!canSubmit||isTracking}>
            {isSending?'Enviando...':'Transferir'}
          </button>
        </form>

        <div className="card transfer-status" aria-live="polite">
          <h2>Estado</h2>

          {error&&(
            <p className="error">{error}</p>
          )}

          {!correlationId&&!error&&(
            <p className="muted">Todavía no has enviado una transferencia.</p>
          )}

          {correlationId&&(
            <>
              {tracking?.phase==='queued'&&(
                <span className="tx-status tx-status-pending">
                  Recibida, en cola
                </span>
              )}

              {transfer&&(
                <>
                  <span
                    className={`tx-status tx-status-${publicStatus(transfer.status).toLowerCase()}`}
                    title={`Estado interno: ${transfer.status}`}
                  >
                    {DETAILED_STATUS_LABELS[transfer.status]}
                  </span>

                  {transfer.failureReason&&(
                    <div className="transfer-failure">
                      <strong>{failureReasonLabel(transfer.failureReason)}</strong>
                      {failureHelp(transfer.failureReason)&&(
                        <p>{failureHelp(transfer.failureReason)}</p>
                      )}
                    </div>
                  )}

                  <dl className="profile-details">
                    <div>
                      <dt>Monto</dt>
                      <dd>Q{Number(transfer.amount).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Destino</dt>
                      <dd>{transfer.targetAccount}</dd>
                    </div>
                    <div>
                      <dt>Transacción</dt>
                      <dd><code>{transfer.transactionId}</code></dd>
                    </div>
                  </dl>
                </>
              )}

              {isTracking&&(
                <p className="muted">Actualizando…</p>
              )}

              {tracking?.phase==='timeout'&&(
                <p className="notice">
                  La transferencia sigue en proceso. Revisa su estado más tarde
                  en el historial.
                </p>
              )}

              <p className="muted transfer-correlation">
                correlationId: <code>{correlationId}</code>
              </p>

              <Link to={`/transactions?accountId=${transfer?.sourceAccount??sourceAccount}`}>
                Ver historial de la cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
