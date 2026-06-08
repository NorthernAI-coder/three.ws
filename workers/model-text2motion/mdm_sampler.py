"""MDM (Motion Diffusion Model) sampler adapter.

Thin wrapper around GuyTevet/motion-diffusion-model (MIT) that turns a text
prompt into SMPL-skeleton motion: per-frame local joint rotations (axis-angle,
24 joints) plus a root translation. Everything torch/MDM-specific is imported
lazily inside `sample()` so this module imports cleanly in environments without
the GPU stack (the worker's pure conversion path + tests). Loaded once per
container by main.py's `_load_model()`.

The MDM repo is cloned into the image (see Dockerfile) and put on PYTHONPATH;
checkpoints are mounted from the weights bucket at `model_dir`.
"""

from __future__ import annotations

import logging

import numpy as np

log = logging.getLogger("text2motion.mdm")

# HumanML3D motion is sampled at 20 fps; we resample to the requested fps in the
# worker via the clip times. MDM's max horizon for the HumanML3D checkpoint.
HUMANML_FPS = 20
MAX_MOTION_LEN = 196


class MdmSampler:
    def __init__(self, model_dir: str, device: str = "cuda"):
        self.model_dir = model_dir
        self.device = device
        self._model = None
        self._diffusion = None
        self._load()

    def _load(self) -> None:
        # Imports are GPU-only — kept here so the module imports without torch.
        import os

        import torch
        from utils.model_util import create_model_and_diffusion, load_model_wo_clip
        from utils.parser_util import generate_args

        args = generate_args(model_path=os.path.join(self.model_dir, "model.pt"))
        args.dataset = "humanml"
        self._args = args
        model, diffusion = create_model_and_diffusion(args, data=None)
        state = torch.load(os.path.join(self.model_dir, "model.pt"), map_location="cpu")
        load_model_wo_clip(model, state)
        model.to(self.device).eval()
        self._model = model
        self._diffusion = diffusion
        log.info("MDM model + diffusion ready on %s", self.device)

    def sample(self, prompt: str, n_frames: int):
        """Text → (poses (T,24,3) axis-angle, trans (T,3)).

        Samples HumanML3D motion for `prompt`, recovers SMPL joint rotations and
        root translation, and resamples to `n_frames`.
        """
        import torch
        from data_loaders.humanml.scripts.motion_process import recover_from_ric

        horizon = min(MAX_MOTION_LEN, max(2, int(round(n_frames * HUMANML_FPS / max(n_frames, 1))) or n_frames))
        horizon = min(MAX_MOTION_LEN, max(2, n_frames))

        model_kwargs = {"y": {"text": [prompt], "lengths": torch.tensor([horizon], device=self.device)}}
        sample_fn = self._diffusion.p_sample_loop
        with torch.no_grad():
            sample = sample_fn(
                self._model,
                (1, self._model.njoints, self._model.nfeats, horizon),
                clip_denoised=False,
                model_kwargs=model_kwargs,
                progress=False,
            )

        # Decode the HumanML3D vector representation back to joint rotations +
        # root translation, then to SMPL axis-angle. recover_smpl_from_sample is
        # provided by the MDM repo's rotation utilities.
        poses, trans = _decode_to_smpl(sample, self._args)
        poses = np.asarray(poses, dtype=np.float64)
        trans = np.asarray(trans, dtype=np.float64)
        poses, trans = _resample(poses, trans, n_frames)
        return poses, trans


def _decode_to_smpl(sample, args):
    """Decode an MDM sample tensor to (poses (T,24,3), trans (T,3)).

    MDM's HumanML3D checkpoint emits a 263-dim feature vector per frame; the
    repo's `recover_from_ric` + rotation conversion recover joint positions and
    rotations. This isolates that decode so a different MDM variant only touches
    here.
    """
    import torch
    from data_loaders.humanml.scripts.motion_process import recover_from_ric
    from data_loaders.humanml.utils import paramUtil  # noqa: F401  (ensures skeleton tables load)

    # sample: (1, njoints, nfeats, T) → (T, features)
    feats = sample.squeeze(0).permute(2, 0, 1).contiguous()  # (T, njoints, nfeats)
    n_joints = 22
    positions = recover_from_ric(feats.float(), n_joints)  # (T, 22, 3)
    positions = positions.cpu().numpy()

    # Joint positions → SMPL axis-angle via the repo's inverse-kinematics helper.
    from data_loaders.humanml.scripts.motion_process import positions_to_smpl_poses

    poses, trans = positions_to_smpl_poses(positions)
    return poses, trans


def _resample(poses: np.ndarray, trans: np.ndarray, n_frames: int):
    """Linear-resample motion to exactly `n_frames` frames."""
    src = poses.shape[0]
    if src == n_frames:
        return poses, trans
    src_t = np.linspace(0.0, 1.0, src)
    dst_t = np.linspace(0.0, 1.0, n_frames)
    out_poses = np.empty((n_frames,) + poses.shape[1:], dtype=poses.dtype)
    flat = poses.reshape(src, -1)
    out = np.empty((n_frames, flat.shape[1]), dtype=poses.dtype)
    for c in range(flat.shape[1]):
        out[:, c] = np.interp(dst_t, src_t, flat[:, c])
    out_poses = out.reshape((n_frames,) + poses.shape[1:])
    out_trans = np.empty((n_frames, 3), dtype=trans.dtype)
    for c in range(3):
        out_trans[:, c] = np.interp(dst_t, src_t, trans[:, c])
    return out_poses, out_trans
