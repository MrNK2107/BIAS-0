from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# ── .env loading ─────────────────────────────────────────────────────────

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)




# ── Structured Logging ───────────────────────────────────────────────────

_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
_LOG_FORMAT = os.getenv(
    "LOG_FORMAT",
    "%(asctime)s  %(levelname)-8s  %(name)-24s  %(message)s",
)


def configure_logging(*, level: str = _LOG_LEVEL, force: bool = False) -> None:
    """Configure structured logging for the application.

    Call once at startup. Idempotent unless *force* is True.
    """
    if not force and logging.getLogger().handlers:
        return  # already configured

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))

    root = logging.getLogger()
    root.setLevel(getattr(logging, level, logging.INFO))
    # Remove default handlers to avoid duplicate output
    for h in root.handlers[:]:
        root.removeHandler(h)
    root.addHandler(handler)

    # Keep noisy third-party libraries quieter
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


# ── Constants ────────────────────────────────────────────────────────────

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
DEFAULT_BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))
