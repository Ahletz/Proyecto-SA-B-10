import http from 'k6/http';
import {check} from 'k6';
import {Counter} from 'k6/metrics';
const accepted=new Counter('customer_registration_accepted');
const rejected=new Counter('customer_registration_failed');
export const options={scenarios:{customers:{executor:'constant-arrival-rate',rate:1,timeUnit:'1s',duration:__ENV.DURATION||'4m',preAllocatedVUs:4,maxVUs:20}},summaryTrendStats:['p(50)','p(95)','p(99)','min','max']};
export default function(){
 const id=Date.now()+'-'+__VU+'-'+__ITER;
 const res=http.post(__ENV.CUSTOMER_BASE+'/api/customers/register',JSON.stringify({email:'load.'+id+'@example.com',username:'load.'+id,password:'LocalLoad123!',fullName:'Cliente Carga',documentNumber:'DOC-'+id,documentPhoto:'local.png',birthDate:'1995-01-01',address:'Guatemala'}),{headers:{'Content-Type':'application/json','X-Correlation-Id':'load-'+id},timeout:'10s',tags:{operation:'customer.register'}});
 if(res.status===200)accepted.add(1);else rejected.add(1);
 check(res,{'controlled response':r=>r.status===200||r.status>=500});
}
