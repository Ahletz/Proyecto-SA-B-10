// Prueba de carga de transferencias internas por el API Gateway (Fase 3).
// Recorre Gateway -> Transaction -> RabbitMQ -> Account -> Payment (Saga completa).
//
// Variables (-e): BASE_URL, USERNAME, PASSWORD, SOURCE_ACCOUNT, TARGET_ACCOUNT (ambas del cliente USERNAME),
//   PROFILE = smoke | load | stress   (por defecto load),  AMOUNT (por defecto 1)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL;
const AMOUNT = Number(__ENV.AMOUNT || 1);
const accepted = new Counter('transfers_accepted');
const finished = new Counter('transfers_finished');
// Estados finales de la Saga que devuelve /api/transfers/{correlationId} (estado interno de Transaction).
const FINAL = ['COMPLETED', 'FAILED', 'COMPENSATED'];

const PROFILES = {
  // 1 transferencia/s durante 30 s: valida que todo está bien conectado
  smoke: [{ duration: '30s', target: 1 }],
  // carga nominal: sube a 5/s, sostiene 5 min, baja
  load: [
    { duration: '1m', target: 5 },
    { duration: '5m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  // estrés: sube hasta 25/s para encontrar el punto de saturación
  stress: [
    { duration: '1m', target: 5 },
    { duration: '2m', target: 15 },
    { duration: '2m', target: 25 },
    { duration: '1m', target: 0 },
  ],
};
const profile = __ENV.PROFILE || 'load';

export const options = {
  scenarios: {
    transfers: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: PROFILES[profile],
    },
  },
  thresholds: {
    // el Gateway acepta con 202: no más de 1 % de errores y p95 bajo el SLO de 5 s
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:create_transfer}': ['p(95)<5000'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  for (const v of ['BASE_URL', 'USERNAME', 'PASSWORD', 'SOURCE_ACCOUNT', 'TARGET_ACCOUNT']) {
    if (!__ENV[v]) throw new Error(`Falta la variable ${v}`);
  }
  const res = http.post(`${BASE}/api/customers/login`,
    JSON.stringify({ username: __ENV.USERNAME, password: __ENV.PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } });
  const body = res.json();
  const token = body.accessToken || body.token || body.jwt || body.access_token;
  if (!token) throw new Error(`Login sin token (status ${res.status}): ${res.body}`);
  return { token };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` };
  // alterna el sentido para que los saldos casi no cambien durante la prueba
  const forward = __ITER % 2 === 0;
  const payload = JSON.stringify({
    sourceAccount: forward ? __ENV.SOURCE_ACCOUNT : __ENV.TARGET_ACCOUNT,
    targetAccount: forward ? __ENV.TARGET_ACCOUNT : __ENV.SOURCE_ACCOUNT,
    amount: AMOUNT,
  });
  const res = http.post(`${BASE}/api/transfers`, payload, { headers, tags: { name: 'create_transfer' } });
  const ok = check(res, { 'transferencia aceptada (202)': (r) => r.status === 202 });
  if (!ok) return;
  accepted.add(1);

  // 1 de cada 5: consulta el estado final de la Saga (COMPLETED/FAILED/COMPENSATED), esperando hasta 15 s
  if (__ITER % 5 === 0) {
    const id = res.json().correlationId;
    for (let i = 0; i < 15; i++) {
      sleep(1);
      const st = http.get(`${BASE}/api/transfers/${id}`, { headers, tags: { name: 'transfer_status' } });
      const status = st.status === 200 ? st.json().status : null;
      if (FINAL.includes(status)) { finished.add(1); break; }
    }
  }
}
