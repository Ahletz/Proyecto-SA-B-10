# IP global fija del Ingress HTTPS del API Gateway (Fase 3, contrato interbancario: solo HTTPS).
# El certificado gestionado de Google (k8s/overlays/prod/gateway-ingress.yaml) se emite para
# <ip con guiones>.sslip.io, que resuelve a esta IP; si la IP cambiara, el banco pareja perdería la URL.
resource "google_compute_global_address" "gateway" {
  name = "bank-usac-gateway-ip"
}
