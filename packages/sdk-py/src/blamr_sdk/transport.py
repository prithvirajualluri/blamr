"""Non-blocking HTTP transport with offline disk queue."""

from __future__ import annotations

import atexit
import json
import os
import queue
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").lower() in ("1", "true")


def _default_queue_dir() -> Path:
    return Path.home() / ".blamr" / "queue"


class DiskQueue:
  def __init__(self, directory: Path | None, max_bytes: int) -> None:
    self._dir = directory
    self._max_bytes = max_bytes
    self._lock = threading.Lock()

  @property
  def enabled(self) -> bool:
    return self._dir is not None

  def enqueue(self, payload: dict[str, Any]) -> None:
    if not self.enabled:
      return
    try:
      line = json.dumps(payload) + "\n"
      data = line.encode("utf-8")
    except Exception:
      return
    with self._lock:
      try:
        self._dir.mkdir(parents=True, exist_ok=True)  # type: ignore[union-attr]
        self._prune()
        path = self._dir / f"{int(time.time() * 1000)}-{uuid.uuid4().hex}.jsonl"  # type: ignore[operator]
        with open(path, "ab") as handle:
          handle.write(data)
          handle.flush()
          os.fsync(handle.fileno())
      except OSError:
        return

  def _prune(self) -> None:
    if not self.enabled:
      return
    files = sorted(self._dir.glob("*.jsonl"))  # type: ignore[union-attr]
    total = sum(f.stat().st_size for f in files)
    while total > self._max_bytes and files:
      oldest = files.pop(0)
      try:
        total -= oldest.stat().st_size
        oldest.unlink()
      except OSError:
        break

  def iter_files(self) -> list[Path]:
    if not self.enabled or not self._dir.exists():
      return []
    return sorted(self._dir.glob("*.jsonl"))


class BlamrTransport:
  """Best-effort async POST with memory queue and JSONL disk spill."""

  def __init__(
    self,
    api_key: str,
    endpoint: str,
    *,
    sync: bool | None = None,
    disabled: bool | None = None,
    queue_dir: str | None = None,
    max_queue_bytes: int | None = None,
  ) -> None:
    self._api_key = api_key
    self._endpoint = endpoint.rstrip("/")
    self._sync = sync if sync is not None else _env_flag("BLAMR_SYNC_INGEST")
    self._disabled = disabled if disabled is not None else _env_flag("BLAMR_DISABLED")
    max_b = max_queue_bytes or int(os.environ.get("BLAMR_MAX_QUEUE_BYTES", str(256 * 1024 * 1024)))
    qdir = Path(queue_dir) if queue_dir else (
      Path(os.environ["BLAMR_QUEUE_DIR"]) if os.environ.get("BLAMR_QUEUE_DIR") else _default_queue_dir()
    )
    self._disk = DiskQueue(None if self._disabled else qdir, max_b)
    self._mem: queue.Queue[dict[str, Any] | None] = queue.Queue(maxsize=50_000)
    self._stop = threading.Event()
    self._thread = threading.Thread(target=self._run_loop, name="blamr-transport", daemon=True)
    self._flush_thread = threading.Thread(target=self._flush_disk_loop, name="blamr-disk-flush", daemon=True)
    if not self._sync and not self._disabled:
      self._thread.start()
      self._flush_thread.start()
    atexit.register(self.close)

  def send(self, path: str, body: dict[str, Any]) -> None:
    self.send_with_method("POST", path, body)

  def send_with_method(self, method: str, path: str, body: dict[str, Any]) -> None:
    if self._disabled:
      return
    if self._sync:
      self._post(method, path, body)
      return
    try:
      self._mem.put_nowait({"method": method, "path": path, "body": body})
    except queue.Full:
      self._disk.enqueue({"method": method, "path": path, "body": body})

  def flush(self) -> None:
    if self._disabled:
      return
    deadline = time.time() + 30
    while not self._mem.empty() and time.time() < deadline:
      time.sleep(0.05)
    self._flush_disk_once()

  def close(self) -> None:
    self._stop.set()
    try:
      self._mem.put_nowait(None)
    except queue.Full:
      pass
    self.flush()

  def _run_loop(self) -> None:
    while not self._stop.is_set():
      try:
        item = self._mem.get(timeout=0.5)
      except queue.Empty:
        continue
      if item is None:
        break
      try:
        self._post(item.get("method", "POST"), item["path"], item["body"])
      except Exception:
        self._disk.enqueue(item)

  def _flush_disk_loop(self) -> None:
    while not self._stop.is_set():
      self._flush_disk_once()
      time.sleep(2)

  def _flush_disk_once(self) -> None:
    for file in self._disk.iter_files():
      try:
        lines = file.read_text(encoding="utf-8").splitlines()
      except OSError:
        continue
      ok = True
      for line in lines:
        if not line.strip():
          continue
        try:
          req = json.loads(line)
          self._post(req.get("method", "POST"), req["path"], req["body"])
        except Exception:
          ok = False
          break
      if ok:
        try:
          file.unlink()
        except OSError:
          pass

  def _post(self, method: str, path: str, body: dict[str, Any]) -> None:
    if not self._api_key:
      raise RuntimeError("BLAMR_API_KEY is required")
    req = urllib.request.Request(
      f"{self._endpoint}{path}",
      data=json.dumps(body).encode(),
      headers={"Content-Type": "application/json", "X-API-Key": self._api_key},
      method=method,
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
      if resp.status >= 400:
        raise RuntimeError(f"blamr ingest HTTP {resp.status}")
