from runtime import ROOT,WORK
import json,subprocess,urllib.request,urllib.parse,datetime
from pathlib import Path
W=WORK;D=json.loads((W/'runtime.json').read_text());E=W/'incident';timeline=json.loads((E/'timeline.json').read_text());since=timeline[0]['utc'];until=timeline[-1]['utc']
def sql(container,db,query):
 return subprocess.check_output(['docker','exec',D['containers'][container],'psql','-U','alex_test','-d',db,'-At','-c',query],text=True).strip()
result={
 'committedCustomers':int(sql('customer-db','bank_customer',"SELECT count(*) FROM customers WHERE username LIKE 'load.%' AND created_at >= '"+since+"'::timestamptz AND created_at <= '"+until+"'::timestamptz")),
 'auditedRegistrations':int(sql('notification-db','bank_notification',"SELECT count(*) FROM processed_events WHERE event_type='customer.registered' AND correlation_id LIKE 'load-%' AND processed_at >= '"+since+"'::timestamptz AND processed_at <= '"+until+"'::timestamptz")),
 'pendingOutbox':int(sql('notification-db','bank_notification',"SELECT count(*) FROM notification_outbox WHERE status='PENDING'")),
 'failedOutbox':int(sql('notification-db','bank_notification',"SELECT count(*) FROM notification_outbox WHERE status='FAILED'"))}
N='http://127.0.0.1:'+str(D['ports']['notification-audit-service']['http'])
with urllib.request.urlopen(N+'/api/audit/events?paged=true&service=alertmanager') as response:alerts=json.load(response)['items']
actual=[event for event in alerts if event['payload'].get('alertname')=='SloBurnRateFast']
result['sloAlertAudited']=len(actual)>0
(E/'outcome.json').write_text(json.dumps(result,indent=2));(E/'slo-delivery.json').write_text(json.dumps(actual,indent=2))
params=urllib.parse.urlencode({'query':'{service_name="customer-service"} | json | level="ERROR"','start':str(int(datetime.datetime.fromisoformat(since).timestamp()*1e9)),'end':str(int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1e9)),'limit':'20'})
with urllib.request.urlopen('http://127.0.0.1:'+str(D['ports']['loki']['http'])+'/loki/api/v1/query_range?'+params) as response:logs=json.load(response)
(E/'loki-errors.json').write_text(json.dumps(logs,indent=2))
print(json.dumps(result));print('Líneas ERROR en Loki:',sum(len(x['values']) for x in logs['data']['result']))
