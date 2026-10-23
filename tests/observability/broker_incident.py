from runtime import ROOT,WORK
import json,subprocess,time,datetime,urllib.request,urllib.parse,threading
from pathlib import Path
W=WORK;D=json.loads((W/'runtime.json').read_text());evidence=W/'incident';evidence.mkdir(exist_ok=True)
owned=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "purpose"}}',D['containers']['rabbit']],text=True).strip()
if owned!='bankusac-alex-fase3':raise SystemExit('La inyección solo se permite en el broker temporal de Alex')
start=time.time();timeline=[];samples=[]
def stamp(event):
 item={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsed':round(time.time()-start,1),'event':event};timeline.append(item);print(json.dumps(item),flush=True);(evidence/'timeline.json').write_text(json.dumps(timeline,indent=2))
def query(expr):
 try:
  with urllib.request.urlopen('http://127.0.0.1:'+str(D['ports']['prometheus']['http'])+'/api/v1/query?'+urllib.parse.urlencode({'query':expr}),timeout=3) as r:return json.load(r)['data']['result']
 except:return []
stop=threading.Event()
def sampler():
 while not stop.is_set():
  samples.append({'time':time.time(),'errors':query('sum(rate(bank_operations_total{service_name="customer-service",outcome="technical_error"}[1m]))'),'total':query('sum(rate(bank_operations_total{service_name="customer-service"}[1m]))'),'alerts':query('ALERTS{alertname="SloBurnRateFast",service_name="customer-service"}')})
  (evidence/'samples.json').write_text(json.dumps(samples));stop.wait(5)
thread=threading.Thread(target=sampler,daemon=True);thread.start()
image='grafana/k6@sha256:5221b620a4f874faff6e32ba597aa667c058391fe4898b1c6f6377f062c6cdec'
command=['docker','run','--rm','--name','bankusac-alex-load','--label','purpose=bankusac-alex-fase3','--network','host','-e','CUSTOMER_BASE=http://127.0.0.1:'+str(D['ports']['customer-service']['http']),'-v',str(W/'customer-lifecycle.js')+':/script.js:ro',image,'run','--summary-export=/tmp/summary.json','/script.js']
output=open(evidence/'k6.log','w');load=subprocess.Popen(command,stdout=output,stderr=subprocess.STDOUT)
stamp('Inicio de carga Customer a 1 registro/s; baseline 30 s')
broker_stopped=False
try:
 time.sleep(30);stamp('Inicio de inyección: detener aplicación RabbitMQ local')
 subprocess.run(['docker','exec',D['containers']['rabbit'],'rabbitmqctl','stop_app'],stdout=subprocess.DEVNULL,check=True);broker_stopped=True
 stamp('RabbitMQ detenido; mantener carga 150 s')
 time.sleep(150)
 subprocess.run(['docker','exec',D['containers']['rabbit'],'rabbitmqctl','start_app'],stdout=subprocess.DEVNULL,check=True);broker_stopped=False;stamp('RabbitMQ restaurado')
 try:load.wait(timeout=100)
 except subprocess.TimeoutExpired:subprocess.run(['docker','stop','bankusac-alex-load'],stdout=subprocess.DEVNULL);load.wait()
 stamp('Carga terminada; observar recuperación 30 s');time.sleep(30)
 stamp('Fin de observación')
finally:
 if broker_stopped:subprocess.run(['docker','exec',D['containers']['rabbit'],'rabbitmqctl','start_app'],stdout=subprocess.DEVNULL)
 stop.set();thread.join(timeout=10)
 (evidence/'queries-final.json').write_text(json.dumps({'customerOperations':query('bank_operations_total{service_name="customer-service"}'),'burnRate':query('bank:burn_rate:1h{service_name="customer-service"}'),'alert':query('ALERTS{alertname="SloBurnRateFast",service_name="customer-service"}')},indent=2))
 print('Escenario local finalizado; RabbitMQ restaurado',flush=True)
