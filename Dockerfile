# ─── Stage 1 ───
FROM node:20-slim AS node-builder

RUN npm install -g esbuild@0.20.2

# Настоящий бинарник — в @esbuild/linux-x64
RUN ln -sf /usr/local/lib/node_modules/@esbuild/linux-x64/bin/esbuild /usr/local/bin/esbuild

# Проверяем, что работает
RUN esbuild --version


# ─── Stage 2 ───
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Node
COPY --from=node-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=node-builder /usr/local/bin/npm  /usr/local/bin/npm
COPY --from=node-builder /usr/local/bin/npx  /usr/local/bin/npx

# Готовый симлинк
COPY --from=node-builder /usr/local/bin/esbuild /usr/local/bin/esbuild

# Всё, включая @esbuild
COPY --from=node-builder /usr/local/lib/node_modules /usr/local/lib/node_modules

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py index.html style.css script.js .

EXPOSE 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} 
