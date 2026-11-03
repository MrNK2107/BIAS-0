# BIAS-0: one image, API and UI on one port.
#   docker build -t bias0 .
#   docker run -p 8080:8080 -e DEMO_MODE=1 bias0      # sample-data demo, auth off, in-memory
#   docker run -p 8080:8080 --env-file backend/.env bias0   # Firebase-backed
# Platforms that inject $PORT (Cloud Run, Render, Fly, Railway) are honoured.

# Stage 1: build the UI
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# Stage 2: API plus the built UI
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    OMP_NUM_THREADS=4
WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-build /frontend/dist ./frontend/dist

# Run as an unprivileged user; uploads in demo mode go to a writable folder.
RUN useradd --create-home --uid 10001 bias0 \
    && mkdir -p /app/backend/.local_storage \
    && chown -R bias0 /app/backend/.local_storage
USER bias0
WORKDIR /app/backend
ENV LOCAL_STORAGE_DIR=/app/backend/.local_storage

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8080\")}/health', timeout=4)"

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers"]
