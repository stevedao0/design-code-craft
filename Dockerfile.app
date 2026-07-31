# =========================================
# VCPMC Production App Dockerfile
# Reconstructed from image history (apps-app:latest)
# =========================================
FROM python:3.12-slim

# Install system deps + Node.js + cloudflared
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Download official Cloudflare cloudflared binary
# (pinned to a stable release tag; curl + chmod to install)
ARG CLOUDFLARED_VERSION=2026.6.1
RUN curl -fsSL \
    "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64" \
    --output /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && cloudflared --version

WORKDIR /app

# Copy source
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
COPY templates/ /app/templates/

# Python deps
ENV PYTHONPATH=/app/backend
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Build frontend (bakes new DeploymentPage into image)
WORKDIR /app/frontend
RUN npm ci && npm run build

# Back to app root
WORKDIR /app

# Storage dirs
RUN mkdir -p /app/storage /app/storage/preview /app/storage/gcn_qr

# Healthcheck
EXPOSE 8000/tcp

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
