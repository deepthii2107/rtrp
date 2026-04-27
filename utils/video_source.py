"""
Helpers for resolving the configured input video path.
"""
import os


DEFAULT_VIDEO_PATH = "reference_video.mp4"
VIDEO_PATH_ENV_VAR = "VIDEO_PATH"


def get_video_path() -> str:
    """
    Return the configured video path.

    If VIDEO_PATH is set, it can be absolute or relative to the repository
    root. Otherwise, fall back to the historical default filename.
    """
    configured_path = os.getenv(VIDEO_PATH_ENV_VAR, DEFAULT_VIDEO_PATH).strip()
    if not configured_path:
        configured_path = DEFAULT_VIDEO_PATH

    if os.path.isabs(configured_path):
        return configured_path

    return os.path.abspath(configured_path)
