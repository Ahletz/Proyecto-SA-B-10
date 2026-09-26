import {FormEvent,useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2,LogIn,MailCheck,UserPlus} from 'lucide-react';
import {AuthLayout} from '../components/AuthLayout';
import {api} from '../lib/api';
import {
  EMPTY_REGISTRATION,
  maxBirthDate,
  RegistrationErrors,
  RegistrationForm,
  toRegisterRequest,
  validateRegistration
} from '../lib/registration';

interface Registered{
  username:string;
  activationToken:string;
}

interface FieldConfig{
  key:keyof RegistrationForm;
  label:string;
  type?:string;
  hint?:string;
  optional?:boolean;
  autoComplete?:string;
}

const FIELDS:FieldConfig[]=[
  {key:'fullName',label:'Nombre completo',autoComplete:'name'},
  {key:'email',label:'Correo electrónico',type:'email',autoComplete:'email'},
  {
    key:'username',
    label:'Usuario',
    autoComplete:'username',
    hint:'Solo letras minúsculas, números, punto, guion o guion bajo (3 a 50, sin espacios). Lo usarás para iniciar sesión.'
  },
  {key:'password',label:'Contraseña',type:'password',autoComplete:'new-password',hint:'Mínimo 6 caracteres.'},
  {key:'confirmPassword',label:'Confirmar contraseña',type:'password',autoComplete:'new-password'},
  {key:'documentNumber',label:'Número de documento (DPI)',hint:'De 5 a 50 caracteres: letras, números o guion.'},
  {key:'documentPhoto',label:'Foto del documento',optional:true,hint:'Opcional por ahora.'},
  {key:'birthDate',label:'Fecha de nacimiento',type:'date',hint:'Debes ser mayor de edad.'},
  {key:'address',label:'Dirección',autoComplete:'street-address'}
];

export function RegisterPage(){
  const[form,setForm]=useState<RegistrationForm>(EMPTY_REGISTRATION);
  const[errors,setErrors]=useState<RegistrationErrors>({});
  const[serverError,setServerError]=useState('');
  const[sending,setSending]=useState(false);
  const[registered,setRegistered]=useState<Registered|null>(null);

  function update(key:keyof RegistrationForm,value:string){
    setForm(current=>({...current,[key]:value}));
    // El error del campo se quita al corregirlo; se vuelve a validar al enviar.
    setErrors(current=>({...current,[key]:undefined}));
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    setServerError('');

    const found=validateRegistration(form);
    setErrors(found);

    if(Object.keys(found).length>0){
      return;
    }

    setSending(true);

    try{
      const result=await api('/api/customers/register',{
        method:'POST',
        body:JSON.stringify(toRegisterRequest(form))
      });
      setRegistered({username:result.username,activationToken:result.activationToken});
    }catch(err){
      setServerError(err instanceof Error?err.message:String(err));
    }finally{
      setSending(false);
    }
  }

  if(registered){
    return(
      <AuthLayout title="Registro completado">
        <div className="result-block">
          <CheckCircle2 size={44} className="result-icon success" aria-hidden="true"/>
          <p>
            Tu usuario es <strong>{registered.username}</strong>. Antes de iniciar sesión
            debes activar la cuenta.
          </p>
        </div>
        <Link
          className="btn"
          to={`/activate?token=${encodeURIComponent(registered.activationToken)}`}
        >
          <MailCheck size={18} aria-hidden="true"/>
          Activar ahora
        </Link>
        <p className="muted">
          También puedes usar el enlace del correo de activación.
        </p>
      </AuthLayout>
    );
  }

  return(
    <AuthLayout
      title="Crear cuenta"
      subtitle="Todos los campos son obligatorios salvo los marcados como opcionales."
      wide
    >
      <form className="form register-grid" onSubmit={submit} noValidate>
        {FIELDS.map(field=>(
          <label key={field.key} className={field.key==='address'?'span-2':undefined}>
            <span>
              {field.label}
              {field.optional&&<small className="muted"> (opcional)</small>}
            </span>
            <input
              type={field.type??'text'}
              value={form[field.key]}
              onChange={e=>update(field.key,e.target.value)}
              required={!field.optional}
              autoComplete={field.autoComplete}
              max={field.key==='birthDate'?maxBirthDate():undefined}
              aria-invalid={Boolean(errors[field.key])}
            />
            {field.hint&&!errors[field.key]&&(
              <small className="muted">{field.hint}</small>
            )}
            {errors[field.key]&&(
              <small className="field-error">{errors[field.key]}</small>
            )}
          </label>
        ))}

        {serverError&&<p className="alert alert-error span-2">{serverError}</p>}

        <button className="span-2" disabled={sending}>
          <UserPlus size={18} aria-hidden="true"/>
          {sending?'Registrando...':'Registrar'}
        </button>
      </form>

      <div className="auth-footer">
        <span className="muted">¿Ya tienes cuenta?</span>
        <Link to="/login" className="btn secondary">
          <LogIn size={18} aria-hidden="true"/>
          Iniciar sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
