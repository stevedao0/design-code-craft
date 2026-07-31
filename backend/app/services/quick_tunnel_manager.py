"""Quick Tunnel Manager — singleton managing a Cloudflare Quick Tunnel process.

This manager controls a single cloudflared subprocess that exposes the local
backend (running inside the Docker container on port 8000) to the internet
through a Cloudflare tunnel.  The tunnel URL is temporary and changes each
time the process is started.

Usage
-----
    from .services.quick_tunnel_manager import tunnel_manager

    # Check status
    info = tunnel_manager.get_status()

    # Start the tunnel
    info = tunnel_manager.start()   # blocks until URL is available or timeout

    # Stop the tunnel
    tunnel_manager.stop()

The manager is a process-wide singleton.  It survives FastAPI worker restarts —
each uvicorn worker gets its own process group, so workers do not share state.
"""

from __future__ import annotations

import atexit
import logging
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class TunnelStatus(str, Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"


@dataclass
class TunnelInfo:
    status: TunnelStatus
    url: Optional[str] = None
    pid: Optional[int] = None
    started_at: Optional[str] = None
    last_error: Optional[str] = None
    cloudflared_available: bool = False


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

class QuickTunnelManager:
    """Manages a single cloudflared quick-tunnel process."""

    __slots__ = (
        "_process", "_url", "_pid", "_started_at",
        "_status", "_last_error", "_lock", "_log_tail",
    )

    # Cloudflared official release — Linux amd64 binary.
    # URL is pinned to a specific version tag so the binary is deterministic.
    CLOUDFLARED_VERSION = "2026.6.1"
    CLOUDFLARED_DOWNLOAD = (
        f"https://github.com/cloudflare/cloudflared/releases/download/"
        f"{CLOUDFLARED_VERSION}/cloudflared-linux-amd64"
    )

    # Local path where the binary is cached after first download.
    CLOUDFLARED_PATH = "/tmp/cloudflared"

    # Target is the backend inside the container or on the local machine.
    TUNNEL_TARGET = "http://127.0.0.1:8000"

    # How long to wait (seconds) for cloudflared to emit the tunnel URL.
    START_TIMEOUT = 60

    # Max log lines kept for error display.
    _MAX_LOG_LINES = 10

    # Regex to extract the tunnel URL from cloudflared stdout/stderr.
    _URL_RE = re.compile(r"https://[a-zA-Z0-9._-]+\.trycloudflare\.com")

    def __init__(self) -> None:
        self._process: Optional[subprocess.Popen[bytes]] = None
        self._url: Optional[str] = None
        self._pid: Optional[int] = None
        self._started_at: Optional[str] = None
        self._status: TunnelStatus = TunnelStatus.STOPPED
        self._last_error: Optional[str] = None
        self._log_tail: list[str] = []
        self._lock = threading.Lock()
        # Ensure cleanup on process exit.
        atexit.register(self._atexit)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_status(self) -> TunnelInfo:
        """Return the current tunnel status (thread-safe)."""
        with self._lock:
            self._check_alive()
            return TunnelInfo(
                status=self._status,
                url=self._url,
                pid=self._pid,
                started_at=self._started_at,
                last_error=self._last_error,
                cloudflared_available=self._cloudflared_available(),
            )

    def start(self, *, timeout: int | None = None) -> TunnelInfo:
        """Start the tunnel.  Returns immediately if already running.

        Raises
        ------
        RuntimeError
            If cloudflared is not available in the container.
        TimeoutError
            If the tunnel URL is not received within *timeout* seconds.
        """
        with self._lock:
            if self._status == TunnelStatus.RUNNING and self._process is not None:
                # Already running — return current state.
                return TunnelInfo(
                    status=self._status,
                    url=self._url,
                    pid=self._pid,
                    started_at=self._started_at,
                    last_error=self._last_error,
                    cloudflared_available=self._cloudflared_available(),
                )

            if self._status == TunnelStatus.STARTING:
                # Another thread is already starting — wait for it.
                pass

            return self._do_start(timeout or self.START_TIMEOUT)

    def stop(self) -> TunnelInfo:
        """Stop the tunnel process.  Idempotent."""
        with self._lock:
            return self._do_stop()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _resolve_binary(self) -> str | None:
        """Resolve cloudflared binary path: PATH, then known Windows install locations."""
        import os as _os
        path = shutil.which("cloudflared")
        if path:
            return path
        for win_path in (
            r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
            r"C:\Program Files\cloudflared\cloudflared.exe",
            r"C:\cloudflared\cloudflared.exe",
        ):
            if _os.path.isfile(win_path):
                return win_path
        return None

    def _cloudflared_available(self) -> bool:
        # // #region agent log {"runId":"debug","hypothesisId":"A","sessionId":"2d4139","location":"quick_tunnel_manager.py:163","message":"_cloudflared_available check","data":{"resolved":self._resolve_binary()}}
        result = self._resolve_binary() is not None
        _logger.info("[tunnel] _cloudflared_available = %s (resolved: %s)", result, self._resolve_binary())
        # // #endregion
        return result

    def _binary_cached(self) -> bool:
        # // #region agent log {"runId":"debug","hypothesisId":"B","sessionId":"2d4139","location":"quick_tunnel_manager.py:178","message":"_binary_cached check","data":{"resolved":self._resolve_binary()}}
        result = self._resolve_binary() is not None
        _logger.info("[tunnel] _binary_cached = %s (resolved: %s)", result, self._resolve_binary())
        # // #endregion
        return result

    def _run_binary(self, args: list[str]) -> int:
        """Run cloudflared (from PATH or known install locations) and return exit code."""
        import os as _os
        import subprocess as _subprocess

        def _try_run(binary: str) -> tuple[int, str | None]:
            # On Windows, GUI apps need CREATE_NO_WINDOW and stdin=DEVNULL
            # to avoid hanging on pipe reads.
            kwargs: dict = {
                "capture_output": True,
                "timeout": 10,
            }
            if _os.name == "nt":
                kwargs["stdin"] = _subprocess.DEVNULL
                kwargs["creationflags"] = _subprocess.CREATE_NO_WINDOW
            try:
                r = _subprocess.run([binary] + args, **kwargs)
                return r.returncode, None
            except _subprocess.TimeoutExpired:
                return -1, "timeout"
            except Exception as ex:
                return -2, str(ex)

        # Try PATH first
        path = shutil.which("cloudflared")
        if path:
            _logger.info("[tunnel] _run_binary PATH=%s", path)
            code, err = _try_run(path)
            _logger.info("[tunnel] _run_binary code=%d err=%s", code, err)
            return code

        # Try known Windows install locations
        for win_path in (
            r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
            r"C:\Program Files\cloudflared\cloudflared.exe",
            r"C:\cloudflared\cloudflared.exe",
        ):
            if _os.path.isfile(win_path):
                _logger.info("[tunnel] _run_binary fallback=%s", win_path)
                code, err = _try_run(win_path)
                _logger.info("[tunnel] _run_binary code=%d err=%s", code, err)
                return code

        _logger.warning("[tunnel] _run_binary: cloudflared not found in PATH or fallback locations")
        return -999

    def _download_binary(self) -> None:
        """Download the official cloudflared binary if not already cached."""
        if self._binary_cached():
            return
        _logger.info("Downloading cloudflared %s", self.CLOUDFLARED_VERSION)
        result = subprocess.run(
            [
                "curl", "-fsSL",
                "--output", self.CLOUDFLARED_PATH,
                "--max-time", "120",
                self.CLOUDFLARED_DOWNLOAD,
            ],
            timeout=130,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Failed to download cloudflared: exit {result.returncode}"
            )
        subprocess.run(["chmod", "+x", self.CLOUDFLARED_PATH], check=True)
        _logger.info("cloudflared binary installed at %s", self.CLOUDFLARED_PATH)

    def _do_start(self, timeout: int) -> TunnelInfo:
        # Ensure binary is available.
        try:
            self._download_binary()
        except Exception as ex:
            self._status = TunnelStatus.ERROR
            self._last_error = f"Cannot download cloudflared: {ex}"
            self._log_tail = [self._last_error]
            return self._snapshot()

        # Kill any stale process from a previous run.
        self._do_stop()

        self._status = TunnelStatus.STARTING
        self._last_error = None
        self._log_tail = []
        self._started_at = datetime.now(timezone.utc).isoformat()

        binary = self._resolve_binary()
        if binary is None:
            self._status = TunnelStatus.ERROR
            self._last_error = (
                "cloudflared not found. Install from: "
                "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
            )
            self._log_tail = [self._last_error]
            return self._snapshot()

        import os as _os
        import subprocess as _subprocess

        popen_kwargs: dict = {
            "stdout": _subprocess.PIPE,
            "stderr": _subprocess.PIPE,
            # bufsize=-1 (default): use system buffer in binary mode.
            # bufsize=1 (line mode) is ignored in binary mode and causes RuntimeWarning.
        }
        # On Windows, GUI apps need CREATE_NO_WINDOW and stdin=DEVNULL
        # to avoid blocking / hanging when spawned from a GUI context.
        if _os.name == "nt":
            popen_kwargs["stdin"] = _subprocess.DEVNULL
            popen_kwargs["creationflags"] = _subprocess.CREATE_NO_WINDOW

        self._process = _subprocess.Popen(
            [binary, "tunnel", "--url", self.TUNNEL_TARGET, "--no-autoupdate"],
            **popen_kwargs,
        )
        self._pid = self._process.pid
        _logger.info("cloudflared started (pid=%d)", self._pid)

        # Parse URL from output lines.
        url: Optional[str] = None
        deadline = time.monotonic() + timeout
        log_buf: list[str] = []

        # Capture everything the thread needs as closure vars.
        # read_stream is a bare function passed to Thread, so 'self' must be explicit.
        _process = self._process
        _url_re = self._URL_RE
        _logger_local = _logger
        _max_lines = self._MAX_LOG_LINES

        def read_stream(label: str) -> None:
            nonlocal url
            proc = _process
            if proc is None:
                return
            stream = proc.stdout if label == "stdout" else proc.stderr
            if stream is None:
                return
            try:
                for raw in iter(lambda: stream.read1(4096), b""):
                    decoded = raw.decode("utf-8", errors="replace")
                    for part in decoded.splitlines():
                        part = part.strip()
                        if not part:
                            continue
                        log_buf.append(part)
                        _logger_local.debug("[cloudflared %s] %s", label, part)
                        if url is None:
                            m = _url_re.search(part)
                            if m:
                                url = m.group(0)
                                _logger_local.info("Tunnel URL received: %s", url)
            except Exception:
                pass

        t_out = threading.Thread(target=read_stream, args=("stdout",), daemon=True)
        t_err = threading.Thread(target=read_stream, args=("stderr",), daemon=True)
        t_out.start()
        t_err.start()

        # Wait for URL or timeout.
        while time.monotonic() < deadline:
            if url:
                break
            # Check if process died already.
            rc = self._process.poll()
            if rc is not None:
                # Process exited — join threads to collect remaining output.
                t_out.join(timeout=2)
                t_err.join(timeout=2)
                # Pull any remaining stderr.
                remaining_out, remaining_err = self._process.communicate(timeout=1)
                for raw in [remaining_out, remaining_err]:
                    for line in raw.decode("utf-8", errors="replace").splitlines():
                        line = line.strip()
                        if line:
                            log_buf.append(line)
                self._status = TunnelStatus.ERROR
                self._last_error = f"cloudflared exited with code {rc}"
                self._log_tail = log_buf[-_max_lines :]
                self._process = None
                self._pid = None
                return self._snapshot()

            time.sleep(0.5)

        t_out.join(timeout=2)
        t_err.join(timeout=2)

        if url:
            self._url = url
            self._status = TunnelStatus.RUNNING
            _logger.info("Tunnel running at %s", url)
        else:
            # Timeout — kill and clean up.
            self._status = TunnelStatus.ERROR
            self._last_error = "Timeout waiting for tunnel URL"
            self._log_tail = log_buf[-_max_lines :]
            if self._process:
                self._process.terminate()
                try:
                    self._process.wait(timeout=5)
                except _subprocess.TimeoutExpired:
                    self._process.kill()
                self._process = None
                self._pid = None

        return self._snapshot()

    def _do_stop(self) -> TunnelInfo:
        if self._process is None:
            self._status = TunnelStatus.STOPPED
            self._url = None
            self._pid = None
            return self._snapshot()

        pid = self._process.pid
        _logger.info("Stopping cloudflared (pid=%d)", pid)

        # Drain logs from both streams before terminating.
        try:
            self._process.terminate()
            self._process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._process.kill()
            self._process.wait(timeout=5)
        finally:
            self._process = None
            self._pid = None
            self._url = None
            self._status = TunnelStatus.STOPPED
            self._last_error = None
            self._log_tail = []
            _logger.info("Tunnel stopped")

        return self._snapshot()

    def _check_alive(self) -> None:
        """Update status if the child process died unexpectedly."""
        if (
            self._status == TunnelStatus.RUNNING
            and self._process is not None
            and self._process.poll() is not None
        ):
            self._status = TunnelStatus.ERROR
            self._last_error = "Process exited unexpectedly"
            self._url = None
            self._pid = None

    def _snapshot(self) -> TunnelInfo:
        return TunnelInfo(
            status=self._status,
            url=self._url,
            pid=self._pid,
            started_at=self._started_at,
            last_error=self._last_error,
            cloudflared_available=self._cloudflared_available(),
        )

    def _atexit(self) -> None:
        """Called when the Python process is exiting."""
        try:
            self._do_stop()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

tunnel_manager = QuickTunnelManager()
