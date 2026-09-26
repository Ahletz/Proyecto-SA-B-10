/*
 * Validación del formulario de registro antes de enviarlo a Customer Service.
 * Las reglas replican las del backend (RegisterRequest y CustomerService.register)
 * para que el usuario vea el error junto al campo en vez de un 400 genérico.
 */

export interface RegistrationForm{
  fullName:string;
  email:string;
  username:string;
  password:string;
  confirmPassword:string;
  documentNumber:string;
  documentPhoto:string;
  birthDate:string;
  address:string;
}

export type RegistrationErrors=Partial<Record<keyof RegistrationForm,string>>;

export const EMPTY_REGISTRATION:RegistrationForm={
  fullName:'',
  email:'',
  username:'',
  password:'',
  confirmPassword:'',
  documentNumber:'',
  documentPhoto:'',
  birthDate:'',
  address:''
};

// El backend guarda el usuario en minúsculas; se exige así para que el login coincida.
export const USERNAME_PATTERN=/^[a-z0-9._-]{3,50}$/;
const DOCUMENT_PATTERN=/^[A-Za-z0-9-]{5,50}$/;
const EMAIL_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// La foto del documento es opcional por ahora; Customer exige un valor, así que se envía un marcador.
export const PENDING_DOCUMENT_PHOTO='documento-pendiente.png';

/* Fecha máxima (YYYY-MM-DD) para tener 18 años cumplidos en `today`. */
export function maxBirthDate(today:Date=new Date()){
  const limit=new Date(today.getFullYear()-18,today.getMonth(),today.getDate());
  const month=String(limit.getMonth()+1).padStart(2,'0');
  const day=String(limit.getDate()).padStart(2,'0');
  return `${limit.getFullYear()}-${month}-${day}`;
}

export function validateRegistration(
  form:RegistrationForm,
  today:Date=new Date()
):RegistrationErrors{
  const errors:RegistrationErrors={};
  const fullName=form.fullName.trim();
  const address=form.address.trim();

  if(fullName.length<3){
    errors.fullName='Ingresa tu nombre completo (mínimo 3 caracteres).';
  }

  if(!EMAIL_PATTERN.test(form.email.trim())){
    errors.email='Ingresa un correo válido, por ejemplo nombre@correo.com.';
  }

  if(!form.username){
    errors.username='El usuario es obligatorio.';
  }else if(form.username!==form.username.toLowerCase()){
    errors.username='El usuario solo puede tener letras minúsculas.';
  }else if(!USERNAME_PATTERN.test(form.username)){
    errors.username='Usa de 3 a 50 caracteres: minúsculas, números, punto, guion o guion bajo, sin espacios.';
  }

  if(form.password.length<6){
    errors.password='La contraseña debe tener al menos 6 caracteres.';
  }

  if(form.confirmPassword!==form.password){
    errors.confirmPassword='Las contraseñas no coinciden.';
  }

  if(!DOCUMENT_PATTERN.test(form.documentNumber.trim())){
    errors.documentNumber='De 5 a 50 caracteres: letras, números o guion.';
  }

  if(!form.birthDate){
    errors.birthDate='Ingresa tu fecha de nacimiento.';
  }else if(form.birthDate>maxBirthDate(today)){
    errors.birthDate='Debes ser mayor de edad (18 años o más).';
  }

  if(address.length<5){
    errors.address='Ingresa tu dirección (mínimo 5 caracteres).';
  }

  return errors;
}

/* Cuerpo de POST /api/customers/register (sin la confirmación de contraseña). */
export function toRegisterRequest(form:RegistrationForm){
  return{
    fullName:form.fullName.trim(),
    email:form.email.trim().toLowerCase(),
    username:form.username,
    password:form.password,
    documentNumber:form.documentNumber.trim(),
    documentPhoto:form.documentPhoto.trim()||PENDING_DOCUMENT_PHOTO,
    birthDate:form.birthDate,
    address:form.address.trim()
  };
}
