import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeftRight,History,Send} from 'lucide-react';
import {api} from '../lib/api';
import {accountLabel,formatMoney,KYC_LABELS} from '../lib/format';
import {CopyId,PageHeader} from '../components/ui';
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
  const[searchParams]=useSearchParams();

  const[accounts,setAccounts]=useState<Account[]>([]);
  const[sourceAccount,setSourceAccount]=useState(searchParams.get('source')??'');
  // Destino: una de mis cuentas (selector) o la de otra persona (se pega su ID).
  const[targetMode,setTargetMode]=useState<'own'|'other'>('own');
  const[ownTarget,setOwnTarget]=useState('');
  const[otherTarget,setOtherTarget]=useState('');
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

  const ownTargets=accounts.filter(account=>account.accountId!==sourceAccount);
  const selectedOwnTarget=ownTargets.some(a=>a.accountId===ownTarget)
    ?ownTarget
    :ownTargets[0]?.accountId??'';
  const amountValue=Number(amount);
  const targetValue=targetMode==='own'?selectedOwnTarget:otherTarget.trim();
  const validationError=
    targetValue&&!UUID_PATTERN.test(targetValue)
      ?'El ID de la cuenta destino no es válido. Pídele a la otra persona que lo copie desde su página de Cuentas.'
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
      <PageHeader
        icon={ArrowLeftRight}
        title="Transferir"
        description="Envía dinero entre cuentas y sigue el estado de la operación en tiempo real."
      />

      {customer&&customer.kycStatus!=='VERIFIED'&&(
        <p className="kyc-help">
          Tu identidad no está verificada (KYC {KYC_LABELS[customer.kycStatus].toLowerCase()}): la
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

          <fieldset className="segmented">
            <legend>Cuenta destino</legend>
            <label className={targetMode==='own'?'active':''}>
              <input
                type="radio"
                name="target-mode"
                checked={targetMode==='own'}
                onChange={()=>setTargetMode('own')}
              />
              Otra de mis cuentas
            </label>
            <label className={targetMode==='other'?'active':''}>
              <input
                type="radio"
                name="target-mode"
                checked={targetMode==='other'}
                onChange={()=>setTargetMode('other')}
              />
              Cuenta de otra persona
            </label>
          </fieldset>

          {targetMode==='own'?(
            <label>
              Mi cuenta destino
              <select
                value={selectedOwnTarget}
                onChange={e=>setOwnTarget(e.target.value)}
                disabled={ownTargets.length===0}
              >
                {ownTargets.length===0&&(
                  <option value="">Necesitas otra cuenta activa</option>
                )}
                {ownTargets.map(account=>(
                  <option key={account.accountId} value={account.accountId}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            </label>
          ):(
            <label>
              ID de la cuenta destino
              <input
                placeholder="Pega el ID que te compartió la otra persona"
                value={otherTarget}
                onChange={e=>setOtherTarget(e.target.value)}
              />
              <small className="muted">
                La otra persona lo copia con el botón junto al ID en su página de Cuentas.
              </small>
            </label>
          )}

          <label>
            Monto
            <span className="input-prefix">
              <span aria-hidden="true">Q</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e=>setAmount(e.target.value)}
              />
            </span>
          </label>

          {validationError&&(
            <p className="alert alert-error">{validationError}</p>
          )}

          <button type="submit" disabled={!canSubmit||isTracking}>
            <Send size={18} aria-hidden="true"/>
            {isSending?'Enviando...':'Transferir'}
          </button>
        </form>

        <div className="card transfer-status" aria-live="polite">
          <h2>Estado</h2>

          {error&&(
            <p className="alert alert-error">{error}</p>
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
                      <dd>{formatMoney(transfer.amount)}</dd>
                    </div>
                    <div>
                      <dt>Destino</dt>
                      <dd><CopyId value={transfer.targetAccount}/></dd>
                    </div>
                    <div>
                      <dt>Transacción</dt>
                      <dd><CopyId value={transfer.transactionId}/></dd>
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
                Código de seguimiento: <CopyId value={correlationId}/>
              </p>

              <Link className="btn secondary" to={`/transactions?accountId=${transfer?.sourceAccount??sourceAccount}`}>
                <History size={16} aria-hidden="true"/>
                Ver historial de la cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
