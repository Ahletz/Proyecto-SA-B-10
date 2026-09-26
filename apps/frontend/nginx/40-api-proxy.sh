#!/bin/sh
# Genera la configuración de nginx al arrancar el contenedor.
# - Siempre: sirve la SPA en el puerto 3000 (fallback a index.html para React Router).
# - Solo si API_UPSTREAM está definido (producción en Cloud Run): proxy de /api hacia el
#   API Gateway, así el navegador llama al mismo origen HTTPS y no hay contenido mixto
#   ni CORS. En dev (kind/compose) no se define y el frontend llama al Gateway con
#   VITE_API_BASE_URL.
set -eu

PROXY=""
if [ -n "${API_UPSTREAM:-}" ]; then
  PROXY="
    location /api/ {
        proxy_pass ${API_UPSTREAM};
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }"
  echo "40-api-proxy.sh: /api -> ${API_UPSTREAM}"
fi

cat > /etc/nginx/conf.d/default.conf <<CONF
server {
    listen 3000;
    root /usr/share/nginx/html;
    ${PROXY}

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
CONF
