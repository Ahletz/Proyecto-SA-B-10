from runtime import ROOT,WORK
from pathlib import Path
import json,urllib.request,time,subprocess,uuid,base64,datetime
W=WORK;d=json.loads((W/'runtime.json').read_text())
C='http://127.0.0.1:'+str(d['ports']['customer-service']['http']);N='http://127.0.0.1:'+str(d['ports']['notification-audit-service']['http']);R='http://127.0.0.1:'+str(d['ports']['rabbit']['15672']);M='http://127.0.0.1:'+str(d['ports']['mailhog']['8025'])
def req(url,method='GET',body=None,headers={}):
 data=json.dumps(body).encode() if body is not None else None
 request=urllib.request.Request(url,data=data,method=method,headers={'Content-Type':'application/json',**headers})
 with urllib.request.urlopen(request,timeout=15) as r:return json.load(r)
def ready(url):
 for _ in range(60):
  try:
   if req(url).get('status')=='UP':return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Service not ready')
ready(C+'/actuator/health');ready(N+'/actuator/health')
uid=str(int(time.time()));trace=uuid.uuid4().hex
reg=req(C+'/api/customers/register','POST',{'email':'alex'+uid+'@example.com','username':'alex'+uid,'password':'LocalTest123!','fullName':'Cliente Local','documentNumber':'DOC-'+uid,'documentPhoto':'local.png','birthDate':'1995-01-01','address':'Guatemala'},{'X-Correlation-Id':'lifecycle-'+uid,'traceparent':'00-'+trace+'-1234567890abcdef-01'})
customer=reg['customerId']
admin=req(C+'/api/customers/login','POST',{'username':'admin','password':'Admin123!'})['token']
auth={'Authorization':'Bearer '+admin}
req(C+'/api/customers/'+customer+'/kyc','PATCH',{'status':'VERIFIED'},auth)
req(C+'/api/customers/'+customer+'/kyc','PATCH',{'status':'VERIFIED'},auth)
rabbit_auth={'Authorization':'Basic '+base64.b64encode(('alex_test:'+d['password']).encode()).decode()}
event={'eventId':str(uuid.uuid4()),'eventType':'account.anomaly.detected','version':1,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'correlationId':'anomaly-'+uid,'payload':{'accountId':str(uuid.uuid4()),'customerId':customer,'operationCount':6,'threshold':5,'windowMinutes':10}}
for _ in range(2):
 req(R+'/api/exchanges/%2F/bank.events/publish','POST',{'properties':{'headers':{'traceparent':'00-'+trace+'-1234567890abcdef-01'}},'routing_key':'account.anomaly.detected','payload':json.dumps(event),'payload_encoding':'string'},rabbit_auth)
for _ in range(40):
 events=req(N+'/api/audit/events');ours=[e for e in events if e['eventId']==event['eventId']]
 if len(ours)==1 and req(M+'/api/v2/messages')['total']>=2:break
 time.sleep(1)
assert len(ours)==1, 'Duplicate anomaly audit'
assert ours[0]['severity']=='WARNING',ours
registered=[e for e in events if e['eventType']=='customer.registered' and e['correlationId']=='lifecycle-'+uid]
assert registered and 'activationToken' not in registered[0]['payload'] and 'email' not in registered[0]['payload']
kyc=[e for e in events if e['eventType']=='customer.kyc.status.changed' and e['correlationId']=='lifecycle-'+uid];assert len(kyc)==1
result={'customerId':customer,'lifecycleCorrelationId':'lifecycle-'+uid,'expectedTraceId':trace,'auditEvents':len(events),'duplicateAnomalyRows':len(ours),'anomalySeverity':ours[0]['severity'],'emails':req(M+'/api/v2/messages')['total'],'kycEventsAfterRepeat':len(kyc),'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(W/'notification-runtime-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
