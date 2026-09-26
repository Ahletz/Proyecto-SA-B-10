// Prueba de carga para demostrar el HPA (80 % de CPU, 1-5 réplicas).
// Pega al Gateway con consultas que llegan a Customer, Account y Transaction.
//
//   API=http://localhost:30080 USERNAME=cliente PASSWORD='Demo123!' ACCOUNT_ID=<uuid> \
//     k6 run tests/load/hpa-load.js
//
// En otra terminal: kubectl -n dev get hpa -w
import http from 'k6/http';
import { check } from 'k6';

const API = __ENV.API || 'http://localhost:30080';
const VUS = Number(__ENV.VUS || 40);

export const options = {
  scenarios: {
    carga: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: VUS },
        { duration: __ENV.DURATION || '3m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.01'] },
};

export function setup() {
  const res = http.post(
    `${API}/api/customers/login`,
    JSON.stringify({ username: __ENV.USERNAME, password: __ENV.PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  return { token: res.json('token') };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}` } };
  const responses = [
    http.get(`${API}/api/transactions?accountId=${__ENV.ACCOUNT_ID}&page=1&size=20`, params),
    http.get(`${API}/api/accounts`, params),
    http.get(`${API}/api/customers/me`, params),
  ];
  responses.forEach((r) => check(r, { 'status 200': (x) => x.status === 200 }));
}
