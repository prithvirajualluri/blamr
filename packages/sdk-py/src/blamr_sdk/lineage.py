"""Object-identity registry for source_hop_ids lineage."""

from __future__ import annotations

import json
from typing import Any


def preview_from_value(value: Any) -> str | None:
  if value is None:
    return None
  if isinstance(value, str):
    t = value.strip()
    return t if t else None
  if isinstance(value, (dict, list)):
    try:
      s = json.dumps(value, default=str)
      return s if s and s != "{}" else None
    except Exception:
      return None
  return str(value)


class HopLineageRegistry:
  def __init__(self) -> None:
    self._objects: dict[int, str] = {}
    self._strings: dict[str, str] = {}
    self._refs: list[Any] = []

  def register(self, value: Any, hop_id: str) -> None:
    if value is None:
      return
    if isinstance(value, str) and value.strip():
      self._strings[value] = hop_id
      self._refs.append(value)
    elif isinstance(value, (dict, list, tuple)):
      self._objects[id(value)] = hop_id
      self._refs.append(value)

  def detect_sources(self, args: tuple[Any, ...], kwargs: dict[str, Any] | None = None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    values: list[Any] = list(args)
    if kwargs:
      values.extend(kwargs.values())
    for val in values:
      if isinstance(val, str):
        hop_id = self._strings.get(val)
        if hop_id and hop_id not in seen:
          seen.add(hop_id)
          out.append(hop_id)
      elif isinstance(val, (dict, list, tuple)):
        hop_id = self._objects.get(id(val))
        if hop_id and hop_id not in seen:
          seen.add(hop_id)
          out.append(hop_id)
    return out
