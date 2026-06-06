FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    QUADRIFLOW_BIN=/usr/local/bin/quadriflow

# ── Build QuadriFlow (MIT) from source ───────────────────────────────────────
# Field-aligned quad-dominant remesher. MIT-licensed (commercial-OK); invoked as
# a standalone CLI so its permissive transitive deps never link into our code.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates \
        libboost-dev libboost-program-options-dev libeigen3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --recursive https://github.com/hjwdzh/QuadriFlow /tmp/quadriflow \
    && cmake -S /tmp/quadriflow -B /tmp/quadriflow/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/quadriflow/build -j "$(nproc)" \
    && install -m 0755 /tmp/quadriflow/build/quadriflow /usr/local/bin/quadriflow \
    && rm -rf /tmp/quadriflow

# ── Runtime deps for trimesh / open3d / assimp / usd ─────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 \
        libassimp-dev libassimp5 \
        libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

WORKDIR /app
COPY worker_security.py /app/worker_security.py
COPY main.py /app/main.py

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
