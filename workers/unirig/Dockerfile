FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

# devel (not runtime) base: the git-sourced UniRig package compiles CUDA point-
# cloud / sparse-conv ops at install time and needs nvcc + a C++ toolchain.
# TORCH_CUDA_ARCH_LIST targets the Cloud Run L4 (compute capability 8.9).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    TORCH_CUDA_ARCH_LIST="8.9+PTX"

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 python3.10-dev python3-pip \
        git curl wget build-essential ninja-build \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && pip install --upgrade pip setuptools wheel

# torch + torchvision first (cached layer), matching the CUDA 12.1 base. UniRig's
# image/render utilities import torchvision, which isn't pulled in transitively.
RUN pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

WORKDIR /app
COPY worker_security.py /app/worker_security.py
COPY rig_glb.py /app/rig_glb.py
COPY main.py /app/main.py

# Wolf3D skeleton templates for blendshape transfer (added in Phase 2).
RUN mkdir -p /app/templates

EXPOSE 8080

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "1", \
     "--timeout-keep-alive", "300"]
