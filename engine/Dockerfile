FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcurl4-openssl-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pow_solver.py .
COPY app.py .
COPY session_data.json .

ENV PORT=10000
ENV MSE_MAX_KEY=sk-msemax-yahya-local-8899
ENV MSE_MAX_CONCURRENT=5
ENV MSE_RATE_LIMIT=120/minute
ENV MSE_REQUEST_TIMEOUT=120
ENV MSE_POW_MAX_WORKERS=4
ENV MSE_IMPERSONATE=chrome120
ENV MSE_SESSION_FILE=session_data.json

EXPOSE 10000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
