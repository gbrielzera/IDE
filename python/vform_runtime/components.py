"""Componentes do formulário vistos pelo script Python: `form.txtNome.value`, `.add_item(...)` etc.

Cada componente guarda um *espelho* das suas propriedades. Ler é local (sem ida e volta à IDE);
escrever atualiza o espelho e acumula uma mudança, enviada à IDE em lote no fim do handler.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from .runtime import Runtime

from .registry import ALIASES, EVENTS, METHODS, SELECTED_ITEM, list_props  # noqa: E402  (tabelas vêm do registro)


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
        if self._props.get(key) == value:
            return
        self._props[key] = value
        self._runtime.queue_change(self._id, key, value)

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
        self._require("clear")
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
