# ═══════════════════════════════════════════════════════════════
# CATSHUB Harness — production image
# ═══════════════════════════════════════════════════════════════

FROM python:3.12-slim

WORKDIR /app

# ─── Системные зависимости ───
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ─── Python-зависимости ───
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Приложение ───
COPY main.py .
COPY index.html .
COPY style.css .
COPY script.js .

# ─── Non-root user ───
RUN useradd -m -u 1000 catshub && chown -R catshub:catshub /app
USER catshub

# ─── Render передаёт $PORT динамически ───
ENV PORT=8000
EXPOSE 8000

# ─── Healthcheck ───
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ─── Запуск ───
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT} 
