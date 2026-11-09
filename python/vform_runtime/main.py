"""Ponto de entrada: `python main.py` lê mensagens da IDE no stdin e responde no stdout."""

import os
import sys


def main() -> int:
    # O pacote vive na pasta pai deste arquivo. Depois de importá-lo, ela sai do sys.path (para os
    # módulos internos não esconderem os do usuário) e a pasta do projeto entra no lugar, para o
    # script poder importar arquivos vizinhos.
    here = os.path.dirname(os.path.abspath(__file__))
    runtime_root = os.path.dirname(here)
    sys.path.insert(0, runtime_root)
    from vform_runtime.rpc import Channel
    from vform_runtime.runtime import LineWriter, Runtime

    def norm(path: str) -> str:
        return os.path.normcase(os.path.abspath(path or "."))

    internal = {norm(here), norm(runtime_root)}
    sys.path[:] = [p for p in sys.path if norm(p) not in internal]
    sys.path.insert(0, os.getcwd())

    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", newline="\n")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass

    channel = Channel(sys.stdin, sys.stdout)
    runtime = Runtime(channel.send)

    # O stdout real é só do protocolo: print() e erros do usuário viram mensagens de console.
    out = LineWriter("info", runtime.console)
    err = LineWriter("error", runtime.console)
    sys.stdout, sys.stderr = out, err

    try:
        for message in channel.messages():
            keep_going = runtime.handle(message)
            out.flush()
            err.flush()
            if not keep_going:
                break
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
