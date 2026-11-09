"""Núcleo do runtime: recebe mensagens da IDE, roda o script do usuário e responde."""

from __future__ import annotations

import inspect
import io
import linecache
import traceback
from typing import Any, Callable

from .components import Component, Event, EVENTS
from .form import App, Form
from .rpc import Send


class LineWriter(io.TextIOBase):
    """Substitui stdout/stderr do script: cada linha escrita vira uma mensagem de console."""

    def __init__(self, level: str, emit: Callable[[str, str], None]) -> None:
        self._level = level
        self._emit = emit
        self._pending = ""

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        self._pending += text
        while "\n" in self._pending:
            line, self._pending = self._pending.split("\n", 1)
            self._emit(self._level, line)
        return len(text)

    def flush(self) -> None:
        if self._pending:
            line, self._pending = self._pending, ""
            self._emit(self._level, line)


def describe_exception(exc: BaseException, script_name: str) -> tuple[str, int | None]:
    """Texto para o console e a linha do script do usuário onde o erro aconteceu."""
    if isinstance(exc, SyntaxError):
        line = exc.lineno
        head = f"{type(exc).__name__}: {exc.msg}"
        where = f'  Arquivo "{script_name}", linha {line}' if line else ""
        source = f"    {exc.text.strip()}" if exc.text else ""
        return "\n".join(part for part in (where, source, head) if part), line

    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == script_name]
    lines = ["Traceback (most recent call last):"] if frames else []
    for frame in frames:
        lines.append(f'  Arquivo "{frame.filename}", linha {frame.lineno}, em {frame.name}')
        if frame.line:
            lines.append(f"    {frame.line}")
    lines.append(f"{type(exc).__name__}: {exc}")
    return "\n".join(lines), (frames[-1].lineno if frames else None)


def _accepts_argument(fn: Callable[..., Any]) -> bool:
    """O handler declara parâmetro (recebe o Event) ou não (é chamado sem argumentos)?"""
    try:
        params = inspect.signature(fn).parameters.values()
    except (TypeError, ValueError):
        return True
    return any(
        p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.VAR_POSITIONAL) for p in params
    )


class Runtime:
    def __init__(self, send: Send) -> None:
        self.send = send
        self.form: Form | None = None
        self.script_name = "script.py"
        self._changes: list[tuple[str, str, Any]] = []

    # ----- saída para a IDE -----
    def console(self, level: str, text: str, line: int | None = None) -> None:
        message: dict[str, Any] = {"type": "console", "level": level, "text": text}
        if line is not None:
            message["line"] = line
            message["file"] = self.script_name
        self.send(message)

    def queue_change(self, comp_id: str, prop: str, value: Any) -> None:
        self._changes.append((comp_id, prop, value))

    def flush(self) -> None:
        """Envia as alterações acumuladas num único `patch` (a última de cada propriedade vence)."""
        if not self._changes:
            return
        latest: dict[tuple[str, str], Any] = {}
        for comp_id, prop, value in self._changes:
            latest[(comp_id, prop)] = value  # dict mantém a ordem da 1ª ocorrência
        self._changes = []
        changes = [{"id": i, "prop": p, "value": v} for (i, p), v in latest.items()]
        self.send({"type": "patch", "changes": changes})

    # ----- execução protegida -----
    def _guard(self, fn: Callable[[], Any]) -> bool:
        """Roda `fn`; um erro do usuário vai para o console e o runtime continua vivo."""
        try:
            fn()
            return True
        except Exception as exc:  # noqa: BLE001 - qualquer erro do script vira mensagem
            text, line = describe_exception(exc, self.script_name)
            self.console("error", text, line)
            return False

    # ----- mensagens da IDE -----
    def handle(self, message: dict[str, Any]) -> bool:
        """Processa uma mensagem. Devolve False quando é hora de encerrar."""
        kind = message.get("type")
        if kind == "ping":
            self.send({"type": "pong"})
        elif kind == "load_form":
            self._load_form(message)
        elif kind == "sync":
            self._sync(message)
        elif kind == "event":
            self._event(message)
        elif kind == "shutdown":
            return False
        elif kind == "_invalid":
            self.console("warn", f"Mensagem inválida ignorada: {message.get('raw')}")
        else:
            self.console("warn", f"Mensagem desconhecida ignorada: {kind!r}")
        return True

    def _load_form(self, message: dict[str, Any]) -> None:
        info = message.get("form") or {}
        self.script_name = str(message.get("script_name") or "script.py")
        source = str(message.get("script") or "")
        linecache.cache[self.script_name] = (
            len(source), None, source.splitlines(True), self.script_name
        )

        components: dict[str, Component] = {}
        for comp_id, data in (message.get("components") or {}).items():
            components[comp_id] = Component(self, comp_id, data.get("type", ""), data.get("props") or {})
        form = Form(self, components)
        app = App(self, str(info.get("title") or info.get("name") or ""))
        self.form = form
        self._changes = []

        namespace: dict[str, Any] = {
            "__name__": "__main__",
            "__file__": self.script_name,
            "form": form,
            "app": app,
        }
        ok = self._guard(lambda: exec(compile(source, self.script_name, "exec"), namespace))
        if ok:
            for handler in list(form._on_load):
                ok = self._call(handler, Event(_FormSender(form), "load", {})) and ok
        self.flush()
        self.send({"type": "loaded", "ok": ok})

    def _sync(self, message: dict[str, Any]) -> None:
        comp = self._component(message.get("id"))
        if comp is not None:
            comp._sync(str(message.get("prop")), message.get("value"))

    def _event(self, message: dict[str, Any]) -> None:
        comp = self._component(message.get("id"))
        name = str(message.get("name"))
        if comp is None or name not in EVENTS.get(comp.type, ()):
            return
        event = Event(comp, name, message.get("args") or {})
        for handler in list(comp._handlers.get(name, [])):
            self._call(handler, event)
        self.flush()

    def _component(self, comp_id: Any) -> Component | None:
        if self.form is None or not isinstance(comp_id, str):
            return None
        return self.form._components.get(comp_id)

    def _call(self, handler: Callable[..., Any], event: Event) -> bool:
        if _accepts_argument(handler):
            return self._guard(lambda: handler(event))
        return self._guard(handler)


class _FormSender:
    """`sender` do evento de carregamento: o próprio formulário."""

    def __init__(self, form: Form) -> None:
        self._form = form

    def __repr__(self) -> str:
        return "<form>"
