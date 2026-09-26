import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {CheckCircle2,LogIn,MailCheck} from 'lucide-react';
import {AuthLayout} from '../components/AuthLayout';
import {api} from '../lib/api';

type Status='idle'|'activating'|'done'|'error';

export function ActivationPage(){
  const[searchParams]=useSearchParams();
  const initialToken=searchParams.get('token')??'';
  const[token,setToken]=useState(initialToken);
  const[status,setStatus]=useState<Status>('idle');
  const[error,setError]=useState('');
  const autoStarted=useRef(false);

  const activate=useCallback(async(value:string)=>{
    setStatus('activating');
    setError('');

    try{
      await api(`/api/customers/activate/${encodeURIComponent(value.trim())}`);
      setStatus('done');
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
      setStatus('error');
    }
  },[]);

  // Desde el correo o el botón "Activar ahora" el código ya viene en la URL: se activa solo.
  useEffect(()=>{
    if(initialToken&&!autoStarted.current){
      autoStarted.current=true;
      void activate(initialToken);
    }
  },[initialToken,activate]);

  if(status==='done'){
    return(
      <AuthLayout title="Cuenta activada">
        <div className="result-block">
          <CheckCircle2 size={44} className="result-icon success" aria-hidden="true"/>
          <p>Tu cuenta está lista. Ya puedes iniciar sesión.</p>
          <p className="muted">
            Para transferir, un administrador debe verificar tu identidad (KYC).
          </p>
        </div>
        <Link to="/login" className="btn">
          <LogIn size={18} aria-hidden="true"/>
          Iniciar sesión
        </Link>
      </AuthLayout>
    );
  }

  function submit(e:FormEvent){
    e.preventDefault();

    if(token.trim()){
      void activate(token);
    }
  }

  return(
    <AuthLayout
      title="Activar cuenta"
      subtitle="Usa el código que recibiste al registrarte o en el correo de activación."
    >
      <form className="form" onSubmit={submit}>
        {status==='error'&&<p className="alert alert-error">{error}</p>}

        <label>
          Código de activación
          <input
            value={token}
            onChange={e=>setToken(e.target.value)}
            placeholder="Ej. a7bf66eb-cc33-49d2-a336-bad258e49bcf"
            required
          />
        </label>

        <button disabled={status==='activating'||!token.trim()}>
          <MailCheck size={18} aria-hidden="true"/>
          {status==='activating'?'Activando...':'Activar'}
        </button>
      </form>

      <div className="auth-footer">
        <span className="muted">¿Ya activaste tu cuenta?</span>
        <Link to="/login" className="btn secondary">
          <LogIn size={18} aria-hidden="true"/>
          Iniciar sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
