from runtime import ROOT,WORK
from pathlib import Path
import json,subprocess,socket,os,yaml
W=WORK;D=json.loads((W/'runtime.json').read_text())
def free():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def start(name,image,args,mounts):
 command=['docker','run','-d','--rm','--name','bankusac-alex-'+name,'--label','purpose=bankusac-alex-fase3','--network','host']
 for source,target in mounts:command+=['-v',str(source)+':'+target+':ro']
 cid=subprocess.check_output(command+[image]+args,text=True).strip();D['containers'][name]=cid
am=free();prom=free();D['ports']['alertmanager']={'http':am};D['ports']['prometheus']={'http':prom}
token=W/'alert-token';token.write_text(D['password']);token.chmod(0o644)
config={'global':{'resolve_timeout':'1m'},'route':{'receiver':'notification-audit','group_by':['alertname','service_name'],'group_wait':'3s','group_interval':'10s','repeat_interval':'1h'},'receivers':[{'name':'notification-audit','webhook_configs':[{'url':'http://127.0.0.1:'+str(D['ports']['notification-audit-service']['http'])+'/internal/alerts/slo','send_resolved':True,'http_config':{'authorization':{'type':'Bearer','credentials_file':'/etc/auth/token'}}}]}]}
# This test-only credential is isolated under a private runtime directory; never version it.
amcfg=W/'alertmanager-local.yml';amcfg.write_text(yaml.safe_dump(config))
start('alertmanager','prom/alertmanager:v0.28.1',['--config.file=/etc/alertmanager/config.yml','--storage.path=/tmp/alertmanager','--web.listen-address=127.0.0.1:'+str(am)],[(amcfg,'/etc/alertmanager/config.yml'),(token,'/etc/auth/token')])
root=ROOT;rules=W/'slo-alerts-local.yml';rules.write_text((root/'observability/alerts/slo-alerts.yaml').read_text())
pcfg=W/'prometheus-local.yml';pcfg.write_text(yaml.safe_dump({'global':{'scrape_interval':'5s','evaluation_interval':'5s'},'rule_files':['/etc/prometheus/rules.yml'],'alerting':{'alertmanagers':[{'static_configs':[{'targets':['127.0.0.1:'+str(am)]}]}]},'scrape_configs':[{'job_name':'otel-collector','static_configs':[{'targets':['127.0.0.1:'+str(D['ports']['collector']['8889'])]}]}]}))
start('prometheus','prom/prometheus:v2.55.1',['--config.file=/etc/prometheus/prometheus.yml','--storage.tsdb.path=/tmp/prometheus','--web.listen-address=127.0.0.1:'+str(prom)],[(pcfg,'/etc/prometheus/prometheus.yml'),(rules,'/etc/prometheus/rules.yml')])
(W/'runtime.json').write_text(json.dumps(D));print('Prometheus y Alertmanager iniciados:',prom,am)
