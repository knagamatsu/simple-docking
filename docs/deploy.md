# Deployment (On-Prem + Cloud Demo)

## On-Prem (single host)
1. Install Docker + Docker Compose on the target host.
2. Clone the repository.
3. **Configure environment** (optional but recommended for production):
   ```bash
   cp .env.example .env
   # Edit .env to set secure passwords, port numbers, etc.
   # See docs/configuration.md for details
   ```
4. Start services:
   ```bash
   docker compose up --build -d
   docker compose ps
   ```
5. Open the UI at `http://<host>:8090/simple-docking/` (or your configured `EXTERNAL_PORT`).

### Data persistence
- `data/postgres` holds metadata.
- `data/object_store` holds outputs (poses/logs).
- Back up both directories for disaster recovery.

## Cloud demo (single VM)
This is the simplest way to demo in the cloud without adding Kubernetes.

1. Provision a VM (Ubuntu) and open TCP port `8090` (or your chosen `EXTERNAL_PORT`).
2. Install Docker + Docker Compose.
3. Clone this repo.
4. **Configure environment** (important for security):
   ```bash
   cp .env.example .env
   # Edit .env to:
   # - Set strong POSTGRES_PASSWORD
   # - Restrict CORS_ORIGINS to your domain
   # - Adjust RATE_LIMIT_PER_MINUTE as needed
   # See docs/configuration.md for all options
   ```
5. Start services:
   ```bash
   docker compose up --build -d
   ```
6. Access: `http://<public-ip>:8090/simple-docking/` (or your configured `EXTERNAL_PORT`).

### Optional: HTTPS with Caddy
If you have a domain name, use Caddy for TLS termination.

`Caddyfile` example:
```
your-domain.example.com {
  reverse_proxy localhost:8090
}
```

Run Caddy (outside Docker) and keep the docker compose stack unchanged.
