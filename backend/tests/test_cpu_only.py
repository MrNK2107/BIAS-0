"""Regression: the CPU-only analysis must not touch the GPU.

The CUDA xgboost wheel probes the GPU on every fit; with GridSearchCV(n_jobs=-1)
that happens in one loky worker per core, and on a busy GPU those probes hung
/pipeline/run-all at "processing" forever. Importing ``core`` hides CUDA from
the process and from every worker it spawns. Each case runs in a fresh
interpreter because the environment is fixed at import time.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

WORKER_ENV = """
import os
import core.models  # noqa: F401  (imports xgboost after the guard ran)
from joblib import Parallel, delayed

def env():
    return os.environ.get("CUDA_VISIBLE_DEVICES", "<unset>")

worker = Parallel(n_jobs=2, backend="loky")(delayed(env)() for _ in range(2))
print(env(), *worker)
"""


def _run(code: str, **env_overrides: str) -> str:
    env = {k: v for k, v in os.environ.items()
           if k not in ("CUDA_VISIBLE_DEVICES", "BIAS_ALLOW_GPU")}
    env.update(env_overrides)
    out = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120,
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.split()


def test_core_hides_cuda_in_process_and_loky_workers():
    assert _run(WORKER_ENV) == ["-1", "-1", "-1"]


def test_explicit_cuda_visible_devices_is_respected():
    assert _run(WORKER_ENV, CUDA_VISIBLE_DEVICES="0")[0] == "0"


def test_gpu_opt_in_leaves_cuda_alone():
    assert _run(WORKER_ENV, BIAS_ALLOW_GPU="1")[0] == "<unset>"


def test_pipeline_status_reports_running_stage():
    from routers import pipeline

    pipeline._stage("t-stage", "training")
    assert pipeline._store_get("t-stage") == {"status": "processing", "stage": "training"}
