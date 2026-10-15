# ─── Stage 1: Node (для бинарника) ───
FROM node:20-slim AS node-builder

RUN npm install -g esbuild@0.20.2

# Создаём симлинк для esbuild
RUN ln -s /usr/local/lib/node_modules/esbuild/bin/esbuild /usr/local/bin/esbuild \
    && esbuild --version


# ─── Stage 2: Python runtime ───
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js + esbuild из Stage 1 ───
COPY --from=node-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=node-builder /usr/local/bin/npm  /usr/local/bin/npm
COPY --from=node-builder /usr/local/bin/npx  /usr/local/bin/npx
COPY --from=node-builder /usr/local/bin/esbuild /usr/local/bin/esbuild
COPY --from=node-builder /usr/local/lib/node_modules /usr/local/lib/node_modules

# ─── Python deps ───
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Backend ───
COPY main.py .
COPY index.html .
COPY style.css .
COPY script.js .

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} 
