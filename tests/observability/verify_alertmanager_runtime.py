from runtime import ROOT,WORK
import json,time,datetime,urllib.request
from pathlib import Path
w=WORK;d=json.loads((w/'runtime.json').read_text());am='http://127.0.0.1:'+str(d['ports']['alertmanager']['http']);n='http://127.0.0.1:'+str(d['ports']['notification-audit-service']['http'])
now=datetime.datetime.now(datetime.timezone.utc);label='AlexDeliveryProbe'
body=[{'labels':{'alertname':label,'service_name':'customer-service','severity':'warning'},'annotations':{'summary':'Prueba local de entrega real'},'startsAt':now.isoformat(),'endsAt':(now+datetime.timedelta(minutes=5)).isoformat()}]
with urllib.request.urlopen(urllib.request.Request(am+'/api/v2/alerts',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST'),timeout=10) as response:status=response.status
found=[]
for _ in range(30):
 with urllib.request.urlopen(n+'/api/audit/events?paged=true&service=alertmanager') as response:events=json.load(response)['items']
 found=[e for e in events if e.get('payload',{}).get('alertname')==label]
 if found:break
 time.sleep(1)
assert len(found)==1,found
result={'alertmanagerApiStatus':status,'receiver':'Notification & Audit','auditRows':len(found),'severity':found[0]['severity'],'traceId':found[0]['traceId'],'correlationId':found[0]['correlationId'],'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(w/'alertmanager-runtime-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
