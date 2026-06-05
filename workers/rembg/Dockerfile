FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# rembg downloads ONNX model weights on first use; pre-cache them during build
# so cold starts are fast. Models live in /root/.u2net/.
RUN pip install rembg==2.0.59 && \
    python -c "import rembg; rembg.new_session('u2net')" && \
    python -c "import rembg; rembg.new_session('isnet-general-use')"

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

WORKDIR /app
COPY worker_security.py /app/worker_security.py
COPY main.py /app/main.py

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
