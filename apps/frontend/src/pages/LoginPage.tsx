import {FormEvent,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {LogIn,UserPlus} from 'lucide-react';
import {AuthLayout} from '../components/AuthLayout';
import {useAuthStore} from '../store/authStore';

export function LoginPage(){
  const[username,setUsername]=useState('');
  const[password,setPassword]=useState('');
  const{login,loading,error}=useAuthStore();
  const navigate=useNavigate();

  async function submit(e:FormEvent){
    e.preventDefault();
    // El usuario se guarda en minúsculas al registrarse.
    await login(username.trim().toLowerCase(),password);

    if(useAuthStore.getState().token){
      navigate('/');
    }
  }

  return(
    <AuthLayout title="Iniciar sesión" subtitle="Ingresa con tu usuario y contraseña.">
      <form className="form" onSubmit={submit}>
        {error&&<p className="alert alert-error">{error}</p>}

        <label>
          Usuario
          <input
            value={username}
            onChange={e=>setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
          <small className="muted">Tu usuario (en minúsculas), no tu correo.</small>
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button disabled={loading}>
          <LogIn size={18} aria-hidden="true"/>
          {loading?'Ingresando...':'Ingresar'}
        </button>
      </form>

      <div className="auth-footer">
        <span className="muted">¿Todavía no tienes cuenta?</span>
        <Link to="/register" className="btn secondary">
          <UserPlus size={18} aria-hidden="true"/>
          Crear cuenta
        </Link>
      </div>
    </AuthLayout>
  );
}
