import {useCallback,useEffect,useRef,useState} from 'react';
import {Globe,Search,Send} from 'lucide-react';
import {api} from '../lib/api';
import {accountLabel,formatMoney,KYC_LABELS} from '../lib/format';
import {CopyId,PageHeader} from '../components/ui';
import {DETAILED_STATUS_LABELS,publicStatus} from '../lib/transactions';
import {
  DESTINATION_ACCOUNT_PATTERN,
  INTERBANK_STATE_LABELS,
  InterbankTransfer,
  PARTNER_BANKS,
  createInterbankTransfer,
  fetchInterbankTransfer,
  interbankReasonLabel,
  isInterbankFinal
} from '../lib/interbank';
import {useAuthStore} from '../store/authStore';

const POLL_INTERVAL_MS=3000;
// Si el otro banco no responde, el depósito vence a los 180 s y luego se consulta y cancela.
const POLL_TIMEOUT_MS=300000;
const AMOUNT_PATTERN=/^[0-9]{1,5}(\.[0-9]{1,2})?$/;

interface Account{
  accountId:string;
  type:string;
  availableBalance:number|string;
  status:string;
}

type Tracking=
  |{phase:'queued'}
  |{phase:'tracking';transfer:InterbankTransfer}
  |{phase:'timeout';transfer:InterbankTransfer|null};

export function InterbankTransferPage(){
  const{customer}=useAuthStore();

  const[accounts,setAccounts]=useState<Account[]>([]);
  const[sourceAccount,setSourceAccount]=useState('');
  const[bankCode,setBankCode]=useState(PARTNER_BANKS[0].code);
  const[destinationAccount,setDestinationAccount]=useState('');
  const[amount,setAmount]=useState('');
  const[description,setDescription]=useState('');

  const[isSending,setIsSending]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[correlationId,setCorrelationId]=useState<string|null>(null);
  const[traceId,setTraceId]=useState<string|null>(null);
  const[tracking,setTracking]=useState<Tracking|null>(null);
  const[lookup,setLookup]=useState('');

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

  // Seguimiento por correlationId hasta que la Saga interbancaria termina.
  useEffect(()=>{
    if(!correlationId){
      return;
    }

    const startedAt=Date.now();
    let cancelled=false;
    let last:InterbankTransfer|null=null;

    const poll=async()=>{
      try{
        const transfer=await fetchInterbankTransfer(correlationId);

        if(cancelled){
          return;
        }

        if(transfer){
          last=transfer;
          setTracking({phase:'tracking',transfer});

          if(isInterbankFinal(transfer)){
            void loadAccounts();
            return;
          }
        }
      }catch(e){
        if(!cancelled){
          setError(e instanceof Error?e.message:String(e));
          return;
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

  const target=destinationAccount.trim();
  const validationError=
    target&&!DESTINATION_ACCOUNT_PATTERN.test(target)
      ?'La cuenta destino solo admite letras, números y guiones (máximo 34).'
      :amount!==''&&(!AMOUNT_PATTERN.test(amount)||!(Number(amount)>=0.01))
        ?'El monto debe ser mayor que cero, con hasta 2 decimales y menos de Q100,000.'
        :description.length>140
          ?'La descripción admite hasta 140 caracteres.'
          :null;
  const canSubmit=Boolean(
    sourceAccount&&bankCode&&target&&amount!==''&&!validationError&&!isSending
  );
  const isTracking=Boolean(correlationId)&&(
    !tracking||tracking.phase==='queued'||
    (tracking.phase==='tracking'&&!isInterbankFinal(tracking.transfer))
  );

  const track=(id:string,trace:string|null)=>{
    setError(null);
    setTracking({phase:'queued'});
    setTraceId(trace);
    setCorrelationId(id);
  };

  const submit=async()=>{
    setIsSending(true);
    setError(null);
    setTracking(null);
    setCorrelationId(null);

    try{
      const accepted=await createInterbankTransfer({
        sourceAccount,
        destinationBankCode:bankCode,
        destinationAccount:target,
        amount,
        description:description.trim()||undefined
      });

      track(accepted.correlationId,accepted.traceId??null);
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
        icon={Globe}
        title="Depósito a otro banco"
        description="Envía dinero a una cuenta de otro banco y sigue su estado hasta que el otro banco lo acepte o se devuelvan los fondos."
      />

      {customer&&customer.kycStatus!=='VERIFIED'&&(
        <p className="kyc-help">
          Tu identidad no está verificada (KYC {KYC_LABELS[customer.kycStatus].toLowerCase()}): el
          depósito será rechazado hasta que un administrador la verifique.
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
            Banco destino
            <select value={bankCode} onChange={e=>setBankCode(e.target.value)}>
              {PARTNER_BANKS.map(bank=>(
                <option key={bank.code} value={bank.code}>{bank.label}</option>
              ))}
            </select>
          </label>

          <label>
            Cuenta destino
            <input
              placeholder="Número de cuenta en el otro banco"
              value={destinationAccount}
              onChange={e=>setDestinationAccount(e.target.value)}
            />
          </label>

          <label>
            Monto
            <span className="input-prefix">
              <span aria-hidden="true">Q</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e=>setAmount(e.target.value.trim())}
              />
            </span>
          </label>

          <label>
            Descripción (opcional)
            <input
              maxLength={140}
              value={description}
              onChange={e=>setDescription(e.target.value)}
            />
          </label>

          {validationError&&(
            <p className="alert alert-error">{validationError}</p>
          )}

          <button type="submit" disabled={!canSubmit||isTracking}>
            <Send size={18} aria-hidden="true"/>
            {isSending?'Enviando...':'Depositar'}
          </button>
        </form>

        <div className="card transfer-status" aria-live="polite">
          <h2>Estado</h2>

          {error&&(
            <p className="alert alert-error">{error}</p>
          )}

          {!correlationId&&!error&&(
            <p className="muted">Todavía no has enviado un depósito.</p>
          )}

          {correlationId&&(
            <>
              {tracking?.phase==='queued'&&(
                <span className="tx-status tx-status-pending">
                  Recibido, en cola
                </span>
              )}

              {transfer&&(
                <>
                  <span
                    className={`tx-status tx-status-${publicStatus(transfer.status).toLowerCase()}`}
                    title={`Estado de la Saga: ${transfer.status}`}
                  >
                    {transfer.interbankState
                      ?INTERBANK_STATE_LABELS[transfer.interbankState]
                      :DETAILED_STATUS_LABELS[transfer.status]}
                  </span>

                  {transfer.failureReason&&(
                    <div className="transfer-failure">
                      <strong>{interbankReasonLabel(transfer.failureReason)}</strong>
                      <p>Si los fondos se habían reservado, ya se devolvieron a tu cuenta.</p>
                    </div>
                  )}

                  <dl className="profile-details">
                    <div>
                      <dt>Monto</dt>
                      <dd>{formatMoney(transfer.amount)}</dd>
                    </div>
                    <div>
                      <dt>Banco destino</dt>
                      <dd>{transfer.destinationBankCode??'—'}</dd>
                    </div>
                    <div>
                      <dt>Cuenta destino</dt>
                      <dd><CopyId value={transfer.targetAccount}/></dd>
                    </div>
                    <div>
                      <dt>Estado con el otro banco</dt>
                      <dd>{transfer.interbankState??'—'}</dd>
                    </div>
                    <div>
                      <dt>Estado de la Saga</dt>
                      <dd>{transfer.status}</dd>
                    </div>
                    <div>
                      <dt>Depósito (interbankTransferId)</dt>
                      <dd><CopyId value={transfer.transactionId}/></dd>
                    </div>
                  </dl>
                </>
              )}

              {isTracking&&(
                <p className="muted">
                  Actualizando… Si el otro banco no responde, el depósito vence a los 3 minutos
                  y se consulta antes de devolver los fondos.
                </p>
              )}

              {tracking?.phase==='timeout'&&(
                <p className="notice">
                  El depósito sigue en proceso. Consulta su estado más tarde con el código de seguimiento.
                </p>
              )}

              <p className="muted transfer-correlation">
                Código de seguimiento (correlationId): <CopyId value={correlationId}/>
              </p>
              {traceId&&(
                <p className="muted transfer-correlation">
                  Traza (traceId): <CopyId value={traceId}/>
                </p>
              )}
            </>
          )}

          <form
            className="form"
            onSubmit={e=>{
              e.preventDefault();

              if(lookup.trim()){
                track(lookup.trim(),null);
              }
            }}
          >
            <label>
              Consultar un depósito
              <input
                placeholder="Código de seguimiento"
                value={lookup}
                onChange={e=>setLookup(e.target.value)}
              />
            </label>
            <button type="submit" className="secondary" disabled={!lookup.trim()}>
              <Search size={16} aria-hidden="true"/>
              Consultar
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
