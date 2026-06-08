FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

# devel base: MDM's dependency stack (and optional CUDA ops) build cleanly with
# nvcc present. TORCH_CUDA_ARCH_LIST targets the Cloud Run L4 (cc 8.9).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    TORCH_CUDA_ARCH_LIST="8.9+PTX" \
    PYTHONPATH=/opt/mdm

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 python3.10-dev python3-pip \
        git curl wget build-essential ninja-build unzip \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && pip install --upgrade pip setuptools wheel

# torch first (cached layer), matching the CUDA 12.1 base.
RUN pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121

# MDM (Motion Diffusion Model, MIT) is not a pip package — clone it, install its
# requirements, and put it on PYTHONPATH (mdm_sampler.py imports from it).
RUN git clone --depth 1 https://github.com/GuyTevet/motion-diffusion-model.git /opt/mdm \
    && pip install -r /opt/mdm/requirements.txt \
    && pip install git+https://github.com/openai/CLIP.git \
    && python -m spacy download en_core_web_sm

# MDM auxiliary data (CLIP weights, glove, evaluators) and the SMPL body models
# + the trained checkpoint are mounted at runtime from the weights bucket
# (MOTION_MODEL_DIR=/weights/mdm) — they are large and license-gated, so they
# live in Cloud Storage, not the image.

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

WORKDIR /app
COPY worker_security.py /app/worker_security.py
COPY smpl_to_clip.py /app/smpl_to_clip.py
COPY mdm_sampler.py /app/mdm_sampler.py
COPY main.py /app/main.py

EXPOSE 8080

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "1", \
     "--timeout-keep-alive", "300"]
