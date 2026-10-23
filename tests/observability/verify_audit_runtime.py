from runtime import ROOT,WORK
from pathlib import Path
import json,urllib.request,urllib.error,subprocess,uuid,time,base64,datetime,os,socket
W=WORK;d=json.loads((W/'runtime.json').read_text());N='http://127.0.0.1:'+str(d['ports']['notification-audit-service']['http']);R='http://127.0.0.1:'+str(d['ports']['rabbit']['15672'])
def req(url,method='GET',body=None,headers={}):
 with urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**headers}),timeout=10) as resp:return json.load(resp)
for _ in range(60):
 try:
  if req(N+'/actuator/health')['status']=='UP':break
 except Exception:time.sleep(1)
auth={'Authorization':'Basic '+base64.b64encode(('alex_test:'+d['password']).encode()).decode()}
first=req(N+'/api/audit/events')[0];target=first['correlationId']
for i in range(225):
 event={'eventId':str(uuid.uuid4()),'eventType':'customer.updated','version':1,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'correlationId':'history-'+str(uuid.uuid4()),'payload':{'customerId':'CUST-HISTORY'}}
 req(R+'/api/exchanges/%2F/bank.events/publish','POST',{'properties':{},'routing_key':'customer.updated','payload':json.dumps(event),'payload_encoding':'string'},auth)
for _ in range(40):
 page=req(N+'/api/audit/events?paged=true&size=20&page=0')
 if page['total']>=228:break
 time.sleep(1)
assert page['total']>=228,page
legacy=req(N+'/api/audit/events');assert all(e['correlationId']!=target for e in legacy)
filtered=req(N+'/api/audit/events?paged=true&correlationId='+target);assert filtered['total']>=1
trace=filtered['items'][0]['traceId'];assert trace and req(N+'/api/audit/events?paged=true&traceId='+trace)['total']>=1
anomaly=req(N+'/api/audit/events?paged=true&service=account-service&level=WARNING');assert anomaly['total']>=1
try:req(N+'/internal/alerts/slo','POST',{'alerts':[]})
except urllib.error.HTTPError as e:assert e.code==401
else:raise AssertionError('Unauthenticated webhook accepted')
alert={'alerts':[{'fingerprint':'local-slo-proof','status':'firing','startsAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'labels':{'alertname':'SloBurnRateFast','service_name':'customer-service'}}]}
headers={'Authorization':'Bearer '+d['password']}
a=req(N+'/internal/alerts/slo','POST',alert,headers);b=req(N+'/internal/alerts/slo','POST',alert,headers)
assert a['newEvents']==1 and b['newEvents']==0
result={'historicalEvents':page['total'],'legacyLimit':len(legacy),'olderEventFound':True,'traceSearch':True,'serviceAndLevelSearch':True,'unauthenticatedWebhook':401,'alertFirstDelivery':a['newEvents'],'alertRepeatedDelivery':b['newEvents'],'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(W/'audit-runtime-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
