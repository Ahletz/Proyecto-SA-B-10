from pathlib import Path
import subprocess,json,os,socket,time,sys,urllib.request,secrets,shutil
ROOT=Path(__file__).resolve().parents[2];WORK=Path(os.environ.get('BANKUSAC_TEST_DIR','/tmp/bankusac-alex-local'));WORK.mkdir(parents=True,exist_ok=True);WORK.chmod(0o700);STATE=WORK/'runtime.json'
def docker(args): return subprocess.check_output(['docker']+args,text=True).strip()
def port(cid,number): return int(json.loads(docker(['inspect','--format','{{json .NetworkSettings.Ports}}',cid]))[str(number)+'/tcp'][0]['HostPort'])
def freeport():
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
def launch(name,image,ports,env=[],extra=[]):
 args=['run','-d','--rm','--name','bankusac-alex-'+name,'--label','purpose=bankusac-alex-fase3']
 for p in ports:args+=['-p','127.0.0.1::'+str(p)]
 for entry in env:args+=['-e',entry]
 cid=docker(args+extra+[image]);return cid,{str(p):port(cid,p) for p in ports}
def boot(service,env,data):
 snapshot=WORK/(service+'-'+str(time.time_ns())+'.jar');shutil.copy2(ROOT/'apps'/service/'target'/(service+'-0.0.1-SNAPSHOT.jar'),snapshot)
 output=open(WORK/(service+'-runtime.log'),'a');proc=subprocess.Popen(['java','-jar',str(snapshot)],env={**os.environ,**env,'DEBUG':'false'},stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
 data['pids'][service]=proc.pid
if __name__=='__main__':
 action=sys.argv[1]
 if action=='start':
  if STATE.exists():raise SystemExit('Runtime ya registrado')
  pwd=secrets.token_hex(16);data={'containers':{},'ports':{},'pids':{},'password':pwd}
  STATE.write_text(json.dumps(data));STATE.chmod(0o600)
  try:
   for name,db in [('customer-db','bank_customer'),('notification-db','bank_notification')]:
    cid,ports=launch(name,'postgres:17-bookworm',[5432],['POSTGRES_DB='+db,'POSTGRES_USER=alex_test','POSTGRES_PASSWORD='+pwd]);data['containers'][name]=cid;data['ports'][name]=ports;STATE.write_text(json.dumps(data))
   for name,image,ports,env in [('rabbit','rabbitmq:4-management-alpine',[5672,15672],['RABBITMQ_DEFAULT_USER=alex_test','RABBITMQ_DEFAULT_PASS='+pwd]),('mailhog','mailhog/mailhog:v1.0.1',[1025,8025],[])]:
    cid,ports=launch(name,image,ports,env);data['containers'][name]=cid;data['ports'][name]=ports;STATE.write_text(json.dumps(data))
   config=WORK/'collector-local.yaml';config.write_text('''receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  debug:
    verbosity: detailed
  prometheus:
    endpoint: 0.0.0.0:8889
    resource_to_telemetry_conversion:
      enabled: true
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [prometheus]
''')
   cid,ports=launch('collector','otel/opentelemetry-collector-contrib:0.111.0',[4318,8889],extra=['-v',str(config)+':/etc/otelcol-contrib/config.yaml:ro']);data['containers']['collector']=cid;data['ports']['collector']=ports;STATE.write_text(json.dumps(data))
   common={'DB_HOST':'127.0.0.1','DB_USERNAME':'alex_test','DB_PASSWORD':pwd,'RABBITMQ_HOST':'127.0.0.1','RABBITMQ_PORT':str(data['ports']['rabbit']['5672']),'RABBITMQ_DEFAULT_USER':'alex_test','RABBITMQ_DEFAULT_PASS':pwd,'OTEL_EXPORTER_OTLP_ENDPOINT':'http://127.0.0.1:'+str(data['ports']['collector']['4318']),'DEPLOY_ENV':'dev','APP_VERSION':'alex-local-validation','ALERT_WEBHOOK_TOKEN':pwd,'JWT_SECRET':'bankusac-alex-local-jwt-secret-for-test-2026','SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE':'4'}
   for service,db in [('customer-service','customer-db'),('notification-audit-service','notification-db')]:
    http=freeport();data['ports'][service]={'http':http}
    env={**common,'DB_PORT':str(data['ports'][db]['5432']),'DB_DATABASE':'bank_customer' if service=='customer-service' else 'bank_notification','SERVER_PORT':str(http),'SEED_DEMO_USERS':'true','SMTP_HOST':'127.0.0.1','SMTP_PORT':str(data['ports']['mailhog']['1025']),'NOTIFICATION_ALERT_EMAIL':'alerts@bankusac.local','SMTP_FROM':'no-reply@bankusac.local'}
    boot(service,env,data);STATE.write_text(json.dumps(data))
   print('Runtime aislado iniciado; puertos:',json.dumps(data['ports']))
  except: STATE.write_text(json.dumps(data));raise
 elif action=='status':
  data=json.loads(STATE.read_text())
  for service in ['customer-service','notification-audit-service']:
   url='http://127.0.0.1:'+str(data['ports'][service]['http'])+'/actuator/health'
   try:
    with urllib.request.urlopen(url,timeout=5) as resp: print(service,resp.status,resp.read().decode()[:100])
   except Exception as e:print(service,type(e).__name__)
 elif action=='stop':
  data=json.loads(STATE.read_text())
  for pid in data['pids'].values():
   try:os.killpg(pid,15)
   except ProcessLookupError:pass
  for cid in data['containers'].values():subprocess.run(['docker','rm','-f',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  time.sleep(3)
  for pid in data['pids'].values():
   try:
    command=Path('/proc/'+str(pid)+'/cmdline').read_bytes()
    if str(WORK).encode() in command:os.kill(pid,9)
   except (ProcessLookupError,FileNotFoundError):pass
  STATE.unlink();print('Runtime eliminado')
