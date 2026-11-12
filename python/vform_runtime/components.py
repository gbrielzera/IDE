"""Componentes do formulário vistos pelo script Python: `form.txtNome.value`, `.add_item(...)` etc.

Cada componente guarda um *espelho* das suas propriedades. Ler é local (sem ida e volta à IDE);
escrever atualiza o espelho e acumula uma mudança, enviada à IDE em lote no fim do handler.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from .runtime import Runtime

from .registry import ALIASES, EVENTS, METHODS, SELECTED_ITEM, defaults, list_props  # noqa: E402  (tabelas vêm do registro)


def to_camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def to_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


class TrackedList(list):
    """Lista que avisa quando é alterada (append, remove, atribuição por índice...)."""

    def __init__(self, items: list[Any], on_change: Callable[[list[Any]], None]) -> None:
        super().__init__(items)
        self._on_change = on_change


def _tracked(name: str) -> Callable[..., Any]:
    base = getattr(list, name)

    def method(self: TrackedList, *args: Any, **kwargs: Any) -> Any:
        result = base(self, *args, **kwargs)
        self._on_change(list(self))
        return result

    method.__name__ = name
    return method


for _name in (
    "append", "extend", "insert", "remove", "pop", "clear", "sort", "reverse",
    "__setitem__", "__delitem__", "__iadd__", "__imul__",
):
    setattr(TrackedList, _name, _tracked(_name))


class Event:
    """Argumento opcional dos handlers: `sender` é o componente; o resto depende do evento."""

    def __init__(self, sender: "Component", name: str, args: dict[str, Any]) -> None:
        self.sender = sender
        self.name = name
        self.args = args
        for key, value in args.items():
            if key.isidentifier() and key not in ("sender", "name", "args"):
                setattr(self, key, value)

    def __repr__(self) -> str:
        return f"<Event {self.name} de {self.sender._id} {self.args}>"


class Component:
    """Um componente do formulário. As propriedades dependem do tipo (veja o painel da IDE)."""

    __slots__ = ("_id", "_type", "_props", "_handlers", "_runtime")

    def __init__(self, runtime: "Runtime", comp_id: str, comp_type: str, props: dict[str, Any]) -> None:
        object.__setattr__(self, "_id", comp_id)
        object.__setattr__(self, "_type", comp_type)
        object.__setattr__(self, "_props", dict(props))
        object.__setattr__(self, "_handlers", {})
        object.__setattr__(self, "_runtime", runtime)

    # ----- identificação -----
    @property
    def id(self) -> str:
        return self._id

    @property
    def type(self) -> str:
        return self._type

    def __repr__(self) -> str:
        return f"<{self._type} {self._id}>"

    # ----- propriedades -----
    def _key(self, name: str) -> str | None:
        """Nome da propriedade no modelo (camelCase) para um nome do script, ou None se não existe."""
        key = to_camel(name)
        if key in self._props:
            return key
        target = ALIASES.get(self._type, {}).get(name)
        if target is not None and target in self._props:
            return target
        return None

    def _names(self) -> list[str]:
        names = [to_snake(k) for k in self._props]
        names.extend(ALIASES.get(self._type, {}))
        if self._type in SELECTED_ITEM:
            names.append("selected_item")
        return sorted(set(names))

    def _unknown(self, name: str) -> AttributeError:
        return AttributeError(
            f"O componente '{self._id}' ({self._type}) não tem '{name}'. "
            f"Disponíveis: {', '.join(self._names())}"
        )

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        if name.startswith("on_"):
            return self._registrar(name[3:])
        if name == "selected_item" and self._type in SELECTED_ITEM:
            items, index = self._props["items"], self._props["selectedIndex"]
            return items[index] if isinstance(index, int) and 0 <= index < len(items) else None
        key = self._key(name)
        if key is None:
            raise self._unknown(name)
        value = self._props[key]
        if key in list_props(self._type) and isinstance(value, list):
            return TrackedList(value, lambda new, k=key: self._set(k, new))
        return value

    def __setattr__(self, name: str, value: Any) -> None:
        if name == "selected_item" and self._type in SELECTED_ITEM:
            items = self._props["items"]
            self._set("selectedIndex", items.index(value) if value in items else -1)
            return
        key = self._key(name)
        if key is None:
            raise self._unknown(name)
        if key in list_props(self._type) and not isinstance(value, list):
            value = list(value)
        self._set(key, value)

    def _set(self, key: str, value: Any) -> None:
        """Altera o espelho e agenda o envio à IDE (sem enviar nada se o valor não mudou)."""
        previous = self._props.get(key)
        if previous == value:
            return
        self._props[key] = value
        self._runtime.queue_change(self._id, key, value)
        # A barra de progresso avisa quando chega ao fim, mesmo quando é o script que muda o valor.
        if key == "value" and "complete" in EVENTS.get(self._type, ()):
            _, high = self._range()
            is_number = isinstance(value, (int, float)) and not isinstance(value, bool)
            was_below = not isinstance(previous, (int, float)) or isinstance(previous, bool) or previous < high
            if is_number and value >= high and was_below:
                self._runtime.emit(self, "complete", {"value": value})

    def _sync(self, key: str, value: Any) -> None:
        """Valor vindo da IDE (o usuário digitou/clicou): atualiza só o espelho."""
        self._props[key] = value

    # ----- eventos -----
    def _registrar(self, event: str) -> Callable[..., Any]:
        allowed = EVENTS.get(self._type, ())
        if event not in allowed:
            raise AttributeError(
                f"{self._type} '{self._id}' não tem o evento 'on_{event}'. "
                f"Eventos: {', '.join('on_' + e for e in allowed) or '(nenhum)'}"
            )

        def register(fn: Callable[..., Any]) -> Callable[..., Any]:
            self._handlers.setdefault(event, []).append(fn)
            return fn

        return register

    def on(self, event: str, fn: Callable[..., Any] | None = None) -> Callable[..., Any]:
        """`btn.on("click", fn)` ou, como decorador, `@btn.on("click")`."""
        register = self._registrar(event)
        return register(fn) if fn is not None else register

    # ----- API comum (quais tipos têm cada método vem do registro) -----
    def show(self) -> None:
        self._require("show")
        self._set("visible", True)

    def hide(self) -> None:
        self._require("hide")
        self._set("visible", False)

    def set_visible(self, visible: Any) -> None:
        self._require("set_visible")
        self._set("visible", bool(visible))

    def enable(self) -> None:
        self._require("enable")
        self._set("enabled", True)

    def disable(self) -> None:
        self._require("disable")
        self._set("enabled", False)

    def set_enabled(self, enabled: Any) -> None:
        self._require("set_enabled")
        self._set("enabled", bool(enabled))

    def set_tooltip(self, text: Any) -> None:
        self._require("set_tooltip")
        self._set("tooltip", "" if text is None else str(text))

    def _number(self, value: Any, what: str, minimum: float | None = None) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
            raise TypeError(f"{what} deve ser um número (recebeu {value!r}).")
        if minimum is not None and value < minimum:
            raise ValueError(f"{what} deve ser pelo menos {minimum} (recebeu {value!r}).")
        return int(value) if float(value).is_integer() else value

    def set_position(self, x: Any, y: Any) -> None:
        self._require("set_position")
        nx, ny = self._number(x, "x"), self._number(y, "y")
        self._set("x", nx)
        self._set("y", ny)

    def set_size(self, width: Any, height: Any) -> None:
        self._require("set_size")
        w, h = self._number(width, "largura", 1), self._number(height, "altura", 1)
        self._set("width", w)
        self._set("height", h)

    def focus(self) -> None:
        self._require("focus")
        self._runtime.flush()  # o que o script já alterou chega antes do pedido de foco
        self._runtime.send({"type": "command", "id": self._id, "name": "focus"})

    def blur(self) -> None:
        self._require("blur")
        self._runtime.flush()
        self._runtime.send({"type": "command", "id": self._id, "name": "blur"})

    def reset(self) -> None:
        """Volta as propriedades aos valores padrão do tipo. Posição, tamanho e ID não mudam."""
        self._require("reset")
        for key, value in defaults(self._type).items():
            self._set(key, value)

    # ----- números (NumericField, Slider, ProgressBar) -----
    def _range(self) -> tuple[float, float]:
        low = self._props.get("minValue", 0)
        high = self._props.get("maxValue", 100)
        low = low if isinstance(low, (int, float)) and not isinstance(low, bool) else 0
        high = high if isinstance(high, (int, float)) and not isinstance(high, bool) else 100
        if self._props.get("allowNegative") is False:
            low = max(0, low)  # "Aceitar negativos" desligado: o mínimo nunca fica abaixo de zero
        return low, max(low, high)

    def _set_number(self, value: float) -> None:
        low, high = self._range()
        value = min(high, max(low, value))
        decimals = self._props.get("decimals")
        if isinstance(decimals, int) and not isinstance(decimals, bool):
            value = round(value, max(0, min(6, decimals)))
        elif isinstance(value, float):
            value = round(value, 6)  # sem "0.30000000000000004"
        self._set("value", int(value) if float(value).is_integer() else value)

    def _current(self) -> float:
        value = self._props.get("value", 0)
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0

    def _amount(self, amount: Any) -> float:
        if amount is None:
            step = self._props.get("step", 1)
            return step if isinstance(step, (int, float)) and not isinstance(step, bool) and step > 0 else 1
        return self._number(amount, "quanto")

    def increment(self, amount: Any = None) -> None:
        self._require("increment")
        self._set_number(self._current() + self._amount(amount))

    def decrement(self, amount: Any = None) -> None:
        self._require("decrement")
        self._set_number(self._current() - self._amount(amount))

    def set_range(self, minimum: Any, maximum: Any) -> None:
        self._require("set_range")
        low, high = self._number(minimum, "mínimo"), self._number(maximum, "máximo")
        if low > high:
            raise ValueError(f"o mínimo ({low}) não pode ser maior que o máximo ({high}).")
        self._set("minValue", low)
        self._set("maxValue", high)
        self._set_number(self._current())  # o valor atual passa a caber na faixa nova

    # ----- liga/desliga (ToggleSwitch) -----
    def toggle(self) -> None:
        """Interruptor: liga/desliga. Card e GroupBox: recolhe/expande."""
        self._require("toggle")
        key = "checked" if "checked" in self._props else "collapsed"
        self._set(key, not bool(self._props.get(key)))

    # ----- recolher/expandir (Card, GroupBox) -----
    def collapse(self) -> None:
        self._require("collapse")
        self._set("collapsed", True)

    def expand(self) -> None:
        self._require("expand")
        self._set("collapsed", False)

    # ----- barra de progresso -----
    def start_indeterminate(self) -> None:
        self._require("start_indeterminate")
        self._set("indeterminate", True)

    def stop_indeterminate(self) -> None:
        self._require("stop_indeterminate")
        self._set("indeterminate", False)

    def turn_on(self) -> None:
        self._require("turn_on")
        self._set("checked", True)

    def turn_off(self) -> None:
        self._require("turn_off")
        self._set("checked", False)

    # ----- data, senha e link -----
    def set_today(self) -> None:
        self._require("set_today")
        import datetime

        self._set("value", datetime.date.today().isoformat())

    def show_password(self) -> None:
        self._require("show_password")
        self._set("revealed", True)

    def hide_password(self) -> None:
        self._require("hide_password")
        self._set("revealed", False)

    def open(self) -> None:
        """Abre o endereço do link no navegador. A IDE só aceita http, https e mailto."""
        self._require("open")
        self._runtime.flush()
        self._runtime.send({"type": "open_url", "url": str(self._props.get("url", ""))})

    # ----- métodos de listas (ComboBox, ListBox, RadioGroup, Tabs, Table) -----
    def _require(self, method: str) -> None:
        """O registro diz quais métodos cada tipo tem: os outros dão um erro claro."""
        if method not in METHODS.get(self._type, frozenset()):
            available = ", ".join(sorted(METHODS.get(self._type, frozenset()))) or "(nenhum)"
            raise AttributeError(f"{self._type} '{self._id}' não tem o método '{method}'. Métodos: {available}")

    def _items_key(self) -> str:
        for key in ("items", "tabs", "rows"):
            if key in self._props:
                return key
        raise AttributeError(f"{self._type} '{self._id}' não tem lista de itens.")

    def add_item(self, item: Any) -> None:
        self._require("add_item")
        key = self._items_key()
        self._set(key, [*self._props[key], item])

    def add_row(self, row: list[Any]) -> None:
        self._require("add_row")
        self._set("rows", [*self._props["rows"], list(row)])

    def remove_item(self, item: Any) -> None:
        """Remove o primeiro item igual a `item` (use `remove_at` para remover por posição)."""
        self._require("remove_item")
        key = self._items_key()
        items = list(self._props[key])
        if item not in items:
            raise ValueError(f"'{item}' não está na lista de '{self._id}'.")
        index = items.index(item)
        items.pop(index)
        self._set(key, items)
        self._fix_selection(index)

    def remove_at(self, index: int) -> None:
        self._require("remove_at")
        key = self._items_key()
        items = list(self._props[key])
        items.pop(index)  # IndexError natural se fora da faixa
        self._set(key, items)
        self._fix_selection(index if index >= 0 else len(items) + 1 + index)

    def clear(self) -> None:
        """Listas e tabelas: remove todos os itens. Campos: esvazia o valor."""
        self._require("clear")
        if not any(k in self._props for k in ("items", "tabs", "rows")):
            self._set("value", "")
            return
        key = self._items_key()
        self._set(key, [])
        if "selectedIndex" in self._props:
            self._set("selectedIndex", -1)

    def _fix_selection(self, removed_index: int) -> None:
        if "selectedIndex" not in self._props:
            return
        selected = self._props["selectedIndex"]
        if selected == removed_index:
            self._set("selectedIndex", -1)
        elif isinstance(selected, int) and selected > removed_index:
            self._set("selectedIndex", selected - 1)
