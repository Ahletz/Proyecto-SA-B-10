import {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Landmark} from 'lucide-react';

/* Marco común de Login, Registro y Activación: marca arriba y tarjeta centrada. */
export function AuthLayout({
  title,
  subtitle,
  wide=false,
  children
}:{
  title:string;
  subtitle?:string;
  wide?:boolean;
  children:ReactNode;
}){
  return(
    <main className="auth-page">
      <Link to="/" className="auth-brand">
        <Landmark size={26} aria-hidden="true"/>
        Bank USAC
      </Link>

      <div className={`card auth-card${wide?' wide':''}`}>
        <h1>{title}</h1>
        {subtitle&&<p className="muted">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
