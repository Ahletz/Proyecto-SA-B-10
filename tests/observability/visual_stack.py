from runtime import ROOT,WORK
from pathlib import Path
import json,subprocess,socket,yaml,time,os
W=WORK;R=ROOT;D=json.loads((W/'runtime.json').read_text())
def free():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def run(name,image,args,mounts=[],env={}):
 command=['docker','run','-d','--rm','--name','bankusac-alex-'+name,'--label','purpose=bankusac-alex-fase3','--network','host']
 for a,b in mounts:command+=['-v',str(a)+':'+b+':ro']
 for key,value in env.items():command+=['-e',key+'='+str(value)]
 cid=subprocess.check_output(command+[image]+args,text=True).strip();D['containers'][name]=cid

tempo_http=free();tempo_otlp=free();loki_http=free();grafana_http=free()
D['ports'].update(tempo={'http':tempo_http,'otlp':tempo_otlp},loki={'http':loki_http},grafana={'http':grafana_http})
for component,key in [('tempo','tempo.yaml'),('loki','loki.yaml')]:
 config=next(doc['data'][key] for doc in yaml.safe_load_all((R/'observability/k8s'/(component+'.yaml')).read_text()) if doc and doc['kind']=='ConfigMap')
 data=yaml.safe_load(config)
 data['server']['http_listen_port']=tempo_http if component=='tempo' else loki_http
 # Avoid localhost gRPC collisions between the two monolithic binaries on host networking.
 data['server']['grpc_listen_port']=free()
 if component=='tempo':
  data['distributor']['receivers']['otlp']['protocols']={'http':{'endpoint':'0.0.0.0:'+str(tempo_otlp)}}
  data['storage']['trace']['wal']['path']='/tmp/tempo/wal';data['storage']['trace']['local']['path']='/tmp/tempo/blocks'
 else:
  data['common']['path_prefix']='/tmp/loki';data['common']['storage']['filesystem']={'chunks_directory':'/tmp/loki/chunks','rules_directory':'/tmp/loki/rules'}
  data['compactor']['working_directory']='/tmp/loki/compactor'
 p=W/(component+'-local.yml');p.write_text(yaml.safe_dump(data))
 run(component,'grafana/'+component+(':'+('2.6.1' if component=='tempo' else '3.2.1')),['-config.file=/etc/local/config.yml'],[(p,'/etc/local/config.yml')])
(W/'runtime.json').write_text(json.dumps(D))
# Replace the minimal Collector without changing the ports Java/Prometheus already use.
gateway=subprocess.check_output(['docker','inspect','--format','{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}',D['containers']['collector']],text=True).strip()
config={'receivers':{'otlp':{'protocols':{'http':{'endpoint':'0.0.0.0:4318'}}},'filelog':{'include':['/logs/customer-service-runtime.log','/logs/notification-audit-service-runtime.log'],'start_at':'end','operators':[
 {'type':'filter','expr':'body not matches "^[{]"'},
 {'type':'json_parser','parse_to':'attributes.log'},
 {'type':'copy','from':'attributes.log.serviceName','to':'resource["service.name"]'},
 {'type':'copy','from':'attributes.log.environment','to':'resource["deployment.environment"]'},
 {'type':'severity_parser','parse_from':'attributes.log.level'},
 {'type':'trace_parser','if':'attributes.log.traceId != ""','trace_id':{'parse_from':'attributes.log.traceId'},'span_id':{'parse_from':'attributes.log.spanId'}},
 {'type':'remove','field':'attributes.log'}]}},'exporters':{'debug':{'verbosity':'detailed'},'prometheus':{'endpoint':'0.0.0.0:8889','resource_to_telemetry_conversion':{'enabled':True}},'otlphttp/tempo':{'endpoint':'http://'+gateway+':'+str(tempo_otlp)},'otlphttp/loki':{'endpoint':'http://'+gateway+':'+str(loki_http)+'/otlp'}},'service':{'pipelines':{'traces':{'receivers':['otlp'],'exporters':['debug','otlphttp/tempo']},'metrics':{'receivers':['otlp'],'exporters':['prometheus']},'logs':{'receivers':['filelog'],'exporters':['otlphttp/loki']}}}}
p=W/'collector-visual.yml';p.write_text(yaml.safe_dump(config))
subprocess.run(['docker','rm','-f',D['containers']['collector']],stdout=subprocess.DEVNULL,check=True)
args=['docker','run','-d','--rm','--name','bankusac-alex-collector','--label','purpose=bankusac-alex-fase3','-p','127.0.0.1:'+str(D['ports']['collector']['4318'])+':4318','-p','127.0.0.1:'+str(D['ports']['collector']['8889'])+':8889','-v',str(p)+':/etc/otelcol-contrib/config.yaml:ro']
for name in ['customer-service','notification-audit-service']:args+=['-v',str(W/(name+'-runtime.log'))+':/logs/'+name+'-runtime.log:ro']
D['containers']['collector']=subprocess.check_output(args+['otel/opentelemetry-collector-contrib:0.111.0'],text=True).strip()
provision=W/'grafana-provisioning';(provision/'datasources').mkdir(parents=True,exist_ok=True);(provision/'dashboards').mkdir(exist_ok=True)
ds={'apiVersion':1,'datasources':[{'name':'Prometheus','uid':'prometheus','type':'prometheus','access':'proxy','url':'http://127.0.0.1:'+str(D['ports']['prometheus']['http']),'isDefault':True},
 {'name':'Tempo','uid':'tempo','type':'tempo','access':'proxy','url':'http://127.0.0.1:'+str(tempo_http)},
 {'name':'Loki','uid':'loki','type':'loki','access':'proxy','url':'http://127.0.0.1:'+str(loki_http),'jsonData':{'derivedFields':[{'name':'traceId','matcherRegex':'"traceId":"([0-9a-f]{32})"','datasourceUid':'tempo','url':'$${__value.raw}','urlDisplayLabel':'Ver traza'}]}}]}
(provision/'datasources'/'sources.yaml').write_text(yaml.safe_dump(ds))
(provision/'dashboards'/'provider.yaml').write_text(yaml.safe_dump({'apiVersion':1,'providers':[{'name':'bank','type':'file','options':{'path':'/var/lib/grafana/dashboards'}}]}))
run('grafana','grafana/grafana:11.3.0',[],[(provision,'/etc/grafana/provisioning'),(R/'observability/dashboards','/var/lib/grafana/dashboards')],{'GF_SERVER_HTTP_ADDR':'127.0.0.1','GF_SERVER_HTTP_PORT':grafana_http,'GF_SECURITY_ADMIN_USER':'admin','GF_SECURITY_ADMIN_PASSWORD':D['password'],'GF_PATHS_DATA':'/tmp/grafana','GF_ANALYTICS_REPORTING_ENABLED':'false','GF_ANALYTICS_CHECK_FOR_UPDATES':'false'})
(W/'runtime.json').write_text(json.dumps(D));print('Stack visual local:',json.dumps({k:v for k,v in D['ports'].items() if k in ['grafana','tempo','loki']}))
