# Deployment (On-Prem + Cloud Demo)

## On-Prem (single host)
1. Install Docker + Docker Compose on the target host.
2. Clone the repository and start services:
   ```
   docker compose up --build -d
   docker compose ps
   ```
3. Open the UI at `http://<host>:8090/simple-docking/`.

### Data persistence
- `data/postgres` holds metadata.
- `data/object_store` holds outputs (poses/logs).
- Back up both directories for disaster recovery.

## Cloud demo (single VM)
This is the simplest way to demo in the cloud without adding Kubernetes.

1. Provision a VM (Ubuntu) and open TCP port `8090`.
2. Install Docker + Docker Compose.
3. Clone this repo and run:
   ```
   docker compose up --build -d
   ```
4. Access: `http://<public-ip>:8090/simple-docking/`.

### Optional: HTTPS with Caddy
If you have a domain name, use Caddy for TLS termination.

`Caddyfile` example:
```
your-domain.example.com {
  reverse_proxy localhost:8090
}
```

Run Caddy (outside Docker) and keep the docker compose stack unchanged.
