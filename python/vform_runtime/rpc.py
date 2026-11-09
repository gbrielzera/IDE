"""Canal de mensagens: um objeto JSON por linha, em UTF-8.

O stdout "de verdade" fica reservado ao protocolo; `print()` do usuário é desviado para o
console da IDE (veja `LineWriter` em runtime.py).
"""

from __future__ import annotations

import json
import threading
from typing import IO, Any, Callable, Iterator


class Channel:
    def __init__(self, reader: IO[str], writer: IO[str]) -> None:
        self._reader = reader
        self._writer = writer
        self._lock = threading.Lock()

    def send(self, message: dict[str, Any]) -> None:
        line = json.dumps(message, ensure_ascii=False, default=str)
        with self._lock:
            try:
                self._writer.write(line + "\n")
                self._writer.flush()
            except (BrokenPipeError, OSError, ValueError):
                pass  # a IDE já fechou o canal; não há mais para quem enviar

    def messages(self) -> Iterator[dict[str, Any]]:
        """Mensagens recebidas, até o canal fechar. Linhas inválidas viram `_invalid`."""
        for raw in self._reader:
            line = raw.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                yield {"type": "_invalid", "raw": line[:200]}
                continue
            yield message if isinstance(message, dict) else {"type": "_invalid", "raw": line[:200]}


Send = Callable[[dict[str, Any]], None]
