#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KGPedia EC2 One-Time Setup Script
# Run this ONCE on a fresh Ubuntu 22.04 t2.micro instance after SSH-ing in.
#
# Architecture: FastAPI serves both API and the React SPA (no Nginx).
#   Browser → EC2 port 80 → Docker container (uvicorn, port 8000)
#     /api/* /ws/* /health → FastAPI handlers
#     everything else      → dist/index.html or dist/<file> (FileResponse)
#
# Usage:
#   chmod +x setup-ec2.sh
#   sudo ./setup-ec2.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> [1/5] Updating system packages..."
apt-get update -y && apt-get upgrade -y

echo "==> [2/5] Installing Git and curl..."
apt-get install -y git curl

echo "==> [3/5] Installing Docker..."
curl -fsSL https://get.docker.com | sh
# Allow the ubuntu user to run docker without sudo
usermod -aG docker ubuntu 2>/dev/null || usermod -aG docker ec2-user 2>/dev/null || true
systemctl enable docker
systemctl start docker

echo "==> [4/5] Creating application directories..."
# /opt/kgpedia      — git repo root (backend code)
# /opt/kgpedia/dist — frontend static files synced by CI, mounted into Docker
mkdir -p /opt/kgpedia/dist
chown -R ubuntu:ubuntu /opt/kgpedia 2>/dev/null || \
chown -R ec2-user:ec2-user /opt/kgpedia 2>/dev/null || true

echo "==> [5/5] Cloning the repo..."
# Replace YOUR_GITHUB_USERNAME with your actual GitHub username.
# If the repo is private you need a deploy key — see GitHub docs.
git clone https://github.com/YOUR_GITHUB_USERNAME/KGPedia.git /opt/kgpedia

echo ""
echo "┌──────────────────────────────────────────────────────────────────┐"
echo "│  MANUAL STEPS REQUIRED BEFORE RUNNING THE FIRST CI DEPLOY       │"
echo "└──────────────────────────────────────────────────────────────────┘"
echo ""
echo "1. Create /opt/kgpedia/.env with real secrets:"
echo ""
echo "   nano /opt/kgpedia/.env"
echo ""
echo "   Contents:"
echo ""
echo "     OPENAI_API_KEY=sk-..."
echo "     GEMINI_API_KEY=AI..."
echo "     FIREBASE_CREDENTIALS_JSON={\"type\":\"service_account\",\"project_id\":\"...\"}"
echo "     FIREBASE_DATABASE_URL=https://your-project.firebaseio.com"
echo "     LLM_MODEL=gpt-4o-mini"
echo "     GEMINI_GENERATOR_MODEL=gemini-2.5-flash"
echo "     CORS_ORIGINS=http://YOUR_EC2_PUBLIC_IP"
echo "     APP_ENV=production"
echo ""
echo "2. Build the Docker image and start the backend for the first time:"
echo ""
echo "   cd /opt/kgpedia"
echo "   docker build -t kgpedia-backend ./profchat-backend/"
echo "   docker run -d \\"
echo "     --name kgpedia-backend \\"
echo "     --env-file /opt/kgpedia/.env \\"
echo "     -p 80:8000 \\"
echo "     -v /opt/kgpedia/dist:/app/dist:ro \\"
echo "     --restart unless-stopped \\"
echo "     kgpedia-backend"
echo ""
echo "3. Verify the backend is up:"
echo "   curl http://localhost/health"
echo ""
echo "4. Push to main on GitHub to trigger CI/CD."
echo "   The pipeline will rsync the built frontend into /opt/kgpedia/dist/"
echo "   and then rebuild + restart the container with the latest code."
