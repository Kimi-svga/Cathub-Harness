# ═══════════════════════════════════════════════════════════════
# CATSHUB Harness — Dockerfile
# Stage 1: Node (frontend build + esbuild binary)
# Stage 2: Python (runtime) + Node.js + esbuild
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: Frontend builder ───
FROM node:20-slim AS frontend-builder

WORKDIR /build

# Frontend deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --no-audit --no-fund

# Сборка фронта
COPY frontend/ ./frontend/
RUN cd frontend && npm run build


# ─── Stage 2: Python runtime + Node + esbuild ───
FROM python:3.12-slim

WORKDIR /app

# Системные пакеты
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js из Stage 1 (без apt) ───
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-builder /usr/local/bin/npm  /usr/local/bin/npm
COPY --from=frontend-builder /usr/local/bin/npx  /usr/local/bin/npx
COPY --from=frontend-builder /usr/local/lib/node_modules /usr/local/lib/node_modules

# ─── esbuild глобально ───
RUN npm install -g esbuild@0.20.2

# ─── Python deps ───
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Backend ───
COPY main.py .
COPY index.html .
COPY style.css .
COPY script.js .

# ─── Frontend dist из Stage 1 (если нужен) ───
# COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} 
