"""Os objetos que o script do usuário enxerga: `form` (componentes) e `app` (a janela)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable, Iterator

from .components import Component

if TYPE_CHECKING:
    from .runtime import Runtime


class Form:
    """`form.<id>` devolve o componente com aquele ID. `form["id"]` serve para IDs dinâmicos."""

    def __init__(self, runtime: "Runtime", components: dict[str, Component]) -> None:
        object.__setattr__(self, "_runtime", runtime)
        object.__setattr__(self, "_components", components)
        object.__setattr__(self, "_on_load", [])

    def on_load(self, fn: Callable[..., Any]) -> Callable[..., Any]:
        """Decorador: `@form.on_load` roda quando o formulário termina de carregar."""
        self._on_load.append(fn)
        return fn

    def _unknown(self, name: str) -> AttributeError:
        ids = ", ".join(sorted(self._components)) or "(o formulário não tem componentes)"
        return AttributeError(f"Não há componente com o ID '{name}'. IDs disponíveis: {ids}")

    def __getattr__(self, name: str) -> Component:
        if name.startswith("_"):
            raise AttributeError(name)
        try:
            return self._components[name]
        except KeyError:
            raise self._unknown(name) from None

    def __setattr__(self, name: str, value: Any) -> None:
        raise AttributeError(
            f"'form.{name} = ...' não é permitido: use form.<id>.<propriedade> para alterar "
            "componentes e variáveis normais para o resto."
        )

    def __getitem__(self, comp_id: str) -> Component:
        try:
            return self._components[comp_id]
        except KeyError:
            raise self._unknown(comp_id) from None

    def __contains__(self, comp_id: object) -> bool:
        return comp_id in self._components

    def __iter__(self) -> Iterator[Component]:
        return iter(self._components.values())

    def __len__(self) -> int:
        return len(self._components)

    def __dir__(self) -> list[str]:
        return sorted([*self._components, "on_load"])


class App:
    """A janela em execução: título, mensagens e fechar."""

    def __init__(self, runtime: "Runtime", title: str) -> None:
        object.__setattr__(self, "_runtime", runtime)
        object.__setattr__(self, "_title", title)

    @property
    def title(self) -> str:
        return self._title

    @title.setter
    def title(self, value: Any) -> None:
        text = str(value)
        if text != self._title:
            object.__setattr__(self, "_title", text)
            self._runtime.queue_change(":form", "title", text)

    def show_message(self, text: Any, title: str = "") -> None:
        """Mostra uma caixa de mensagem na janela (o script segue em frente sem esperar)."""
        self._runtime.flush()  # o que o script já alterou aparece antes da caixa
        self._runtime.send({"type": "message", "text": str(text), "title": title or self._title})

    def open_form(self, name: Any) -> None:
        """Abre outra tela do projeto nesta janela (a atual é fechada). Ex.: app.open_form("Principal")."""
        self._runtime.flush()
        self._runtime.send({"type": "navigate", "form": str(name)})

    def close(self) -> None:
        """Fecha a janela de execução."""
        self._runtime.flush()
        self._runtime.send({"type": "close"})

    def __setattr__(self, name: str, value: Any) -> None:
        if name != "title":
            raise AttributeError(f"'app.{name}' não existe. Disponíveis: title, show_message(), open_form(), close()")
        App.title.fset(self, value)  # type: ignore[attr-defined]
