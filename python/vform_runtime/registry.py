"""Component Registry: lê registry/components.json, a fonte ÚNICA dos componentes (a IDE lê o mesmo arquivo).

Daqui saem os eventos, apelidos, propriedades de lista e métodos de cada tipo. Para criar ou mudar um
componente, edite o JSON; não há tabelas duplicadas neste pacote.
"""

from __future__ import annotations

import json
import os
from typing import Any


def _locate() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "..", "registry", "components.json"),  # repositório: python/vform_runtime → raiz
        os.path.join(here, "..", "registry", "components.json"),  # empacotado: resources/python + resources/registry
        os.path.join(here, "registry", "components.json"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return os.path.normpath(path)
    raise FileNotFoundError("registry/components.json não encontrado (procurado em: " + "; ".join(candidates) + ")")


with open(_locate(), encoding="utf-8") as _f:
    DATA: dict[str, Any] = json.load(_f)

SPECS: dict[str, dict[str, Any]] = {c["type"]: c for c in DATA["components"]}

# Eventos que cada tipo emite (nome usado em @form.x.on_<evento>).
EVENTS: dict[str, tuple[str, ...]] = {t: tuple(e["name"] for e in s["events"]) for t, s in SPECS.items()}

# Apelidos no script (ex.: TextField.text vale TextField.value).
ALIASES: dict[str, dict[str, str]] = {t: dict(s.get("aliases", {})) for t, s in SPECS.items()}

# Métodos de coleção disponíveis em cada tipo (add_item, remove_at...).
METHODS: dict[str, frozenset[str]] = {t: frozenset(s["methods"]) for t, s in SPECS.items()}

# Tipos que têm `selected_item` (o item selecionado).
SELECTED_ITEM: frozenset[str] = frozenset(t for t, s in SPECS.items() if s.get("selectedItem"))


def list_props(comp_type: str) -> frozenset[str]:
    """Propriedades que são listas (viram TrackedList: `form.cb.items.append(...)` avisa a IDE)."""
    spec = SPECS.get(comp_type)
    if spec is None:
        return frozenset()
    keys = {p["key"] for p in spec["props"] if p["type"] == "items"}
    keys.update(k for k, v in spec.get("runtimeProps", {}).items() if isinstance(v, list))
    return frozenset(keys)
