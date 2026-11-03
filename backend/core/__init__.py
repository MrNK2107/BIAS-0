"""Core analysis package.

Importing anything from ``core`` first hides CUDA devices from this process
and every worker process it spawns (unless ``BIAS_ALLOW_GPU=1``).

Why: the analysis is CPU-only, but the CUDA-enabled xgboost wheel still probes
the GPU (``XGProxyDMatrixCreate`` -> ``cuDevicePrimaryCtxRetain``) on every
fit/predict. GridSearchCV(n_jobs=-1) runs that probe in up to one loky worker
per core at once, and when the GPU is busy those probes stall inside the
CUDA driver indefinitely. A 5000-row /pipeline/run-all then sat at
"processing" for minutes (py-spy showed the worker blocked in nvcuda64.dll)
instead of finishing in ~30 s. With no visible device the probe fails fast
and xgboost stays on CPU, which is what it was doing anyway.
"""

from __future__ import annotations

import os

CPU_ONLY_SENTINEL = "-1"


def hide_cuda_devices() -> None:
    """Hide GPUs unless the user opted in or already chose devices."""
    if os.getenv("BIAS_ALLOW_GPU", "0") == "1":
        return
    # setdefault: respect an explicit CUDA_VISIBLE_DEVICES from the user.
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", CPU_ONLY_SENTINEL)


hide_cuda_devices()
