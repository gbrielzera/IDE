"""Testes do runtime Python. Rodar na raiz do projeto:  python -m unittest discover -s tests/python -v"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from vform_runtime.components import TrackedList, to_camel, to_snake  # noqa: E402
from vform_runtime.runtime import LineWriter, Runtime  # noqa: E402

COMMON = {"x": 0, "y": 0, "width": 100, "height": 24, "enabled": True, "visible": True}


def comps() -> dict:
    return {
        "txtNome": {"type": "TextField", "props": {**COMMON, "value": "", "placeholder": "", "readOnly": False}},
        "btnOk": {"type": "Button", "props": {**COMMON, "text": "OK"}},
        "cbUF": {"type": "ComboBox", "props": {**COMMON, "items": ["SP", "RJ"], "selectedIndex": -1}},
        "lblInfo": {"type": "Label", "props": {**COMMON, "text": "", "align": "left"}},
        "chk": {"type": "CheckBox", "props": {**COMMON, "text": "ok", "checked": False}},
        "tbl": {"type": "Table", "props": {**COMMON, "columns": ["a", "b"], "rows": [], "selectedIndex": -1}},
        "lst": {"type": "ListBox", "props": {**COMMON, "items": ["a", "b", "c"], "selectedIndex": -1}},
        "num": {"type": "NumericField", "props": {**COMMON, "value": 5, "minValue": 0, "maxValue": 10, "step": 2, "decimals": 0, "readOnly": False}},
        "sld": {"type": "Slider", "props": {**COMMON, "value": 50, "minValue": 0, "maxValue": 100, "step": 0.1, "showValue": False}},
        "pb": {"type": "ProgressBar", "props": {**COMMON, "value": 40, "minValue": 0, "maxValue": 100, "indeterminate": False, "showLabel": False}},
        "sw": {"type": "ToggleSwitch", "props": {**COMMON, "text": "x", "checked": False}},
        "dt": {"type": "DatePicker", "props": {**COMMON, "value": "2020-01-01", "minDate": "", "maxDate": ""}},
        "pwd": {"type": "PasswordField", "props": {**COMMON, "value": "abc", "placeholder": "", "showToggle": False, "readOnly": False, "revealed": False}},
        "lnk": {"type": "Link", "props": {**COMMON, "text": "site", "url": "https://exemplo.org/"}},
    }


class Harness:
    def __init__(self) -> None:
        self.sent: list = []
        self.rt = Runtime(self.sent.append)

    def load(self, script: str = "", name: str = "Main.py") -> None:
        self.rt.handle({
            "type": "load_form",
            "form": {"name": "Main", "title": "Principal", "width": 640, "height": 480},
            "components": comps(),
            "script": textwrap.dedent(script),
            "script_name": name,
        })

    def of(self, kind: str) -> list:
        return [m for m in self.sent if m["type"] == kind]

    def errors(self) -> list:
        return [m for m in self.of("console") if m["level"] == "error"]

    def event(self, comp_id: str, name: str, **args) -> None:
        self.rt.handle({"type": "event", "id": comp_id, "name": name, "args": args})

    def sync(self, comp_id: str, prop: str, value) -> None:
        self.rt.handle({"type": "sync", "id": comp_id, "prop": prop, "value": value})

    def clear(self) -> None:
        self.sent.clear()


class NamesTest(unittest.TestCase):
    def test_conversao_entre_snake_e_camel(self) -> None:
        self.assertEqual(to_camel("selected_index"), "selectedIndex")
        self.assertEqual(to_camel("text"), "text")
        self.assertEqual(to_snake("readOnly"), "read_only")
        self.assertEqual(to_snake("fontSize"), "font_size")


class LoadTest(unittest.TestCase):
    def test_executa_script_e_on_load_e_envia_um_unico_patch(self) -> None:
        h = Harness()
        h.load("""
            form.lblInfo.text = "antes"

            @form.on_load
            def inicio():
                form.lblInfo.text = "pronto"
                form.txtNome.placeholder = "Seu nome"
        """)
        patches = h.of("patch")
        self.assertEqual(len(patches), 1)
        self.assertEqual(
            patches[0]["changes"],
            [
                {"id": "lblInfo", "prop": "text", "value": "pronto"},  # a última escrita vence
                {"id": "txtNome", "prop": "placeholder", "value": "Seu nome"},
            ],
        )
        self.assertEqual(h.of("loaded"), [{"type": "loaded", "ok": True}])

    def test_sem_alteracoes_nao_envia_patch(self) -> None:
        h = Harness()
        h.load("x = 1")
        self.assertEqual(h.of("patch"), [])
        self.assertEqual(h.of("loaded")[0]["ok"], True)

    def test_valor_igual_ao_atual_nao_gera_mudanca(self) -> None:
        h = Harness()
        h.load("form.btnOk.text = 'OK'")
        self.assertEqual(h.of("patch"), [])

    def test_titulo_da_janela_vira_patch_do_formulario(self) -> None:
        h = Harness()
        h.load("app.title = 'Cadastro'")
        self.assertEqual(h.of("patch")[0]["changes"], [{"id": ":form", "prop": "title", "value": "Cadastro"}])

    def test_app_title_comeca_com_o_titulo_do_formulario(self) -> None:
        h = Harness()
        h.load("form.lblInfo.text = app.title")
        self.assertEqual(h.of("patch")[0]["changes"], [{"id": "lblInfo", "prop": "text", "value": "Principal"}])

    def test_app_open_form_envia_navigate_depois_de_enviar_o_que_ja_mudou(self) -> None:
        h = Harness()
        h.load('''
            form.lblInfo.text = "saindo"
            app.open_form("Tela2")
        ''')
        kinds = [m["type"] for m in h.sent]
        self.assertLess(kinds.index("patch"), kinds.index("navigate"))  # o que o script já alterou chega antes
        self.assertEqual(h.of("navigate"), [{"type": "navigate", "form": "Tela2"}])


class EventsTest(unittest.TestCase):
    def test_click_chama_handler_com_ou_sem_argumento(self) -> None:
        h = Harness()
        h.load("""
            calls = []

            @form.btnOk.on_click
            def sem_arg():
                calls.append("sem")

            @form.btnOk.on_click
            def com_arg(ev):
                calls.append(("com", ev.sender.id, ev.name))
                form.lblInfo.text = str(calls)
        """)
        h.clear()
        h.event("btnOk", "click")
        self.assertEqual(h.errors(), [])
        text = h.of("patch")[0]["changes"][0]["value"]
        self.assertEqual(text, "['sem', ('com', 'btnOk', 'click')]")

    def test_sync_atualiza_o_espelho_antes_do_evento(self) -> None:
        h = Harness()
        h.load("""
            @form.txtNome.on_change
            def mudou(ev):
                form.lblInfo.text = "Olá, " + form.txtNome.value + "! (" + ev.value + ")"
        """)
        h.clear()
        h.sync("txtNome", "value", "Ana")
        self.assertEqual(h.sent, [])  # sync não responde nada
        h.event("txtNome", "change", value="Ana")
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "Olá, Ana! (Ana)")

    def test_registro_por_on_e_como_decorador(self) -> None:
        h = Harness()
        h.load("""
            def a(): form.lblInfo.text = "a"
            form.btnOk.on("click", a)

            @form.chk.on("change")
            def b(ev): form.lblInfo.text = f"marcado={form.chk.checked}"
        """)
        h.clear()
        h.event("btnOk", "click")
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "a")
        h.clear()
        h.sync("chk", "checked", True)
        h.event("chk", "change", checked=True)
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "marcado=True")

    def test_evento_invalido_para_o_tipo_gera_erro_claro(self) -> None:
        h = Harness()
        h.load("form.btnOk.on_change(lambda: None)")
        self.assertIn("não tem o evento 'on_change'", h.errors()[0]["text"])
        self.assertIn("on_click", h.errors()[0]["text"])
        self.assertEqual(h.of("loaded")[0]["ok"], False)

    def test_eventos_para_ids_ou_nomes_desconhecidos_sao_ignorados(self) -> None:
        h = Harness()
        h.load("")
        h.clear()
        h.event("naoExiste", "click")
        h.event("btnOk", "voar")
        self.assertEqual(h.sent, [])


class ComponentsTest(unittest.TestCase):
    def test_leitura_snake_case_e_apelido_text_do_textfield(self) -> None:
        h = Harness()
        h.load("""
            form.txtNome.text = "Maria"          # apelido de value
            form.cbUF.selected_index = 1
            lido = (form.txtNome.value, form.cbUF.selected_item, form.txtNome.read_only)
            form.lblInfo.text = str(lido)
        """)
        changes = h.of("patch")[0]["changes"]
        self.assertIn({"id": "txtNome", "prop": "value", "value": "Maria"}, changes)
        self.assertIn({"id": "cbUF", "prop": "selectedIndex", "value": 1}, changes)
        self.assertIn({"id": "lblInfo", "prop": "text", "value": "('Maria', 'RJ', False)"}, changes)

    def test_selected_item_pode_ser_atribuido(self) -> None:
        h = Harness()
        h.load("form.cbUF.selected_item = 'RJ'\nform.lst.selected_item = 'nada'")
        changes = {(c["id"], c["prop"]): c["value"] for c in h.of("patch")[0]["changes"]}
        self.assertEqual(changes[("cbUF", "selectedIndex")], 1)
        self.assertNotIn(("lst", "selectedIndex"), changes)  # -1 → -1: sem mudança

    def test_add_item_remove_clear_e_listas_rastreadas(self) -> None:
        h = Harness()
        h.load("""
            form.cbUF.add_item("MG")
            form.cbUF.items.append("BA")
            form.cbUF.items += ["CE"]
            form.cbUF.remove_item("SP")
        """)
        last = [c for c in h.of("patch")[0]["changes"] if c["id"] == "cbUF" and c["prop"] == "items"]
        self.assertEqual(last[-1]["value"], ["RJ", "MG", "BA", "CE"])

        h = Harness()
        h.load("form.lst.selected_index = 2\nform.lst.remove_at(0)\nx = form.lst.selected_index\nform.lblInfo.text = str(x)")
        changes = {(c["id"], c["prop"]): c["value"] for c in h.of("patch")[0]["changes"]}
        self.assertEqual(changes[("lst", "items")], ["b", "c"])
        self.assertEqual(changes[("lblInfo", "text")], "1")  # a seleção acompanhou o item

        h = Harness()
        h.load("form.cbUF.selected_index = 0\nform.cbUF.clear()")
        changes = {(c["id"], c["prop"]): c["value"] for c in h.of("patch")[0]["changes"]}
        self.assertEqual(changes[("cbUF", "items")], [])
        self.assertEqual(changes[("cbUF", "selectedIndex")], -1)

    def test_table_add_row(self) -> None:
        h = Harness()
        h.load("form.tbl.add_row([1, 'x'])\nform.tbl.add_row((2, 'y'))")
        self.assertEqual(h.of("patch")[0]["changes"], [{"id": "tbl", "prop": "rows", "value": [[1, "x"], [2, "y"]]}])
        h = Harness()
        h.load("form.cbUF.add_row([1])")
        self.assertIn("não tem o método 'add_row'", h.errors()[0]["text"])

    def test_remove_item_inexistente_e_erro_do_usuario(self) -> None:
        h = Harness()
        h.load("form.cbUF.remove_item('XX')")
        self.assertIn("ValueError", h.errors()[0]["text"])
        self.assertIn("'XX' não está na lista", h.errors()[0]["text"])

    def test_atribuir_tupla_a_lista_vira_lista(self) -> None:
        h = Harness()
        h.load("form.cbUF.items = ('A', 'B')")
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], ["A", "B"])

    def test_geometria_e_estado_sao_propriedades(self) -> None:
        h = Harness()
        h.load("form.btnOk.x = 50\nform.btnOk.visible = False\nform.btnOk.enabled = False")
        props = {c["prop"] for c in h.of("patch")[0]["changes"]}
        self.assertEqual(props, {"x", "visible", "enabled"})


class ErrorsTest(unittest.TestCase):
    def test_id_inexistente_lista_os_validos(self) -> None:
        h = Harness()
        h.load("form.btnOkk.text = 'x'")
        text = h.errors()[0]["text"]
        self.assertIn("AttributeError: Não há componente com o ID 'btnOkk'", text)
        self.assertIn("btnOk", text)
        self.assertIn("txtNome", text)

    def test_propriedade_inexistente_lista_as_disponiveis(self) -> None:
        h = Harness()
        h.load("form.btnOk.cor = 'red'")
        text = h.errors()[0]["text"]
        self.assertIn("não tem 'cor'", text)
        self.assertIn("text", text)

    def test_nao_deixa_criar_atributos_no_form(self) -> None:
        h = Harness()
        h.load("form.contador = 0")
        self.assertIn("não é permitido", h.errors()[0]["text"])

    def test_acesso_por_colchetes_e_contem(self) -> None:
        h = Harness()
        h.load("""
            nome = "txtNome"
            form[nome].value = "via colchetes"
            assert "btnOk" in form and "x" not in form and len(form) == 14
        """)
        self.assertEqual(h.errors(), [])
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "via colchetes")

    def test_erro_de_execucao_traz_a_linha_do_arquivo_do_usuario(self) -> None:
        h = Harness()
        h.load("""
            x = 1

            def dividir():
                return 1 / 0

            dividir()
        """)
        err = h.errors()[0]
        self.assertEqual(err["line"], 5)  # a linha da divisão, não a do runtime
        self.assertEqual(err["file"], "Main.py")
        self.assertIn("ZeroDivisionError", err["text"])
        self.assertIn('linha 5, em dividir', err["text"])
        self.assertIn("return 1 / 0", err["text"])
        self.assertNotIn("runtime.py", err["text"])
        self.assertEqual(h.of("loaded")[0]["ok"], False)

    def test_erro_de_sintaxe_traz_a_linha(self) -> None:
        h = Harness()
        h.load("x = 1\ny = (2 +\n")
        err = h.errors()[0]
        self.assertIsNotNone(err["line"])
        self.assertIn("SyntaxError", err["text"])
        self.assertEqual(h.of("loaded")[0]["ok"], False)

    def test_erro_no_handler_nao_derruba_o_runtime(self) -> None:
        h = Harness()
        h.load("""
            @form.btnOk.on_click
            def quebra():
                raise RuntimeError("boom")

            @form.btnOk.on_click
            def segue():
                form.lblInfo.text = "segui"

            @form.chk.on_change
            def ok():
                form.lblInfo.text = "chk"
        """)
        h.clear()
        h.event("btnOk", "click")
        self.assertIn("RuntimeError: boom", h.errors()[0]["text"])
        self.assertEqual(h.errors()[0]["line"], 4)
        # O segundo handler do mesmo evento ainda roda, e as alterações dele chegam à IDE.
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "segui")
        h.clear()
        h.event("chk", "change", checked=True)
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "chk")

    def test_erro_no_script_ainda_deixa_registrar_handlers_antes_dele(self) -> None:
        h = Harness()
        h.load("""
            @form.btnOk.on_click
            def ok():
                form.lblInfo.text = "ok"

            1 / 0
        """)
        self.assertEqual(len(h.errors()), 1)
        h.clear()
        h.event("btnOk", "click")
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "ok")

    def test_erro_em_on_load_nao_impede_os_outros(self) -> None:
        h = Harness()
        h.load("""
            @form.on_load
            def a(): raise ValueError("x")

            @form.on_load
            def b(): form.lblInfo.text = "b rodou"
        """)
        self.assertEqual(len(h.errors()), 1)
        self.assertEqual(h.of("patch")[0]["changes"][0]["value"], "b rodou")


class ControlTest(unittest.TestCase):
    def test_ping_pong_e_shutdown(self) -> None:
        h = Harness()
        self.assertTrue(h.rt.handle({"type": "ping"}))
        self.assertEqual(h.sent, [{"type": "pong"}])
        self.assertFalse(h.rt.handle({"type": "shutdown"}))

    def test_mensagens_estranhas_viram_aviso(self) -> None:
        h = Harness()
        self.assertTrue(h.rt.handle({"type": "xpto"}))
        self.assertTrue(h.rt.handle({"type": "_invalid", "raw": "{lixo"}))
        self.assertEqual([m["level"] for m in h.of("console")], ["warn", "warn"])

    def test_show_message_e_close_enviam_as_alteracoes_pendentes_antes(self) -> None:
        h = Harness()
        h.load("form.lblInfo.text = 'salvo'\napp.show_message('Pronto!', 'Aviso')\napp.close()")
        self.assertEqual([m["type"] for m in h.sent], ["patch", "message", "close", "loaded"])
        self.assertEqual(h.of("message")[0], {"type": "message", "text": "Pronto!", "title": "Aviso"})

    def test_tracked_list_avisa_a_cada_mutacao(self) -> None:
        seen: list = []
        lst = TrackedList([1], seen.append)
        lst.append(2)
        lst[0] = 9
        del lst[1]
        lst.sort()
        self.assertEqual(seen, [[1, 2], [9, 2], [9], [9]])


class LineWriterTest(unittest.TestCase):
    def test_divide_em_linhas_e_esvazia_o_resto(self) -> None:
        out: list = []
        w = LineWriter("info", lambda level, text: out.append((level, text)))
        w.write("a\nb")
        w.write("c\n\nd")
        self.assertEqual(out, [("info", "a"), ("info", "bc"), ("info", "")])
        w.flush()
        self.assertEqual(out[-1], ("info", "d"))


class SubprocessTest(unittest.TestCase):
    """Roda o main.py de verdade, como a IDE faz, com pipes."""

    def start(self, cwd: str) -> subprocess.Popen:
        return subprocess.Popen(
            [sys.executable, "-X", "utf8", "-u", str(ROOT / "python" / "vform_runtime" / "main.py")],
            cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    @staticmethod
    def send(proc: subprocess.Popen, message: dict) -> None:
        assert proc.stdin
        proc.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        proc.stdin.flush()

    @staticmethod
    def read_until(proc: subprocess.Popen, kind: str) -> list:
        assert proc.stdout
        got = []
        while True:
            line = proc.stdout.readline()
            if not line:
                raise AssertionError(f"processo terminou sem enviar {kind!r}; recebido: {got}")
            msg = json.loads(line)
            got.append(msg)
            if msg["type"] == kind:
                return got

    def test_protocolo_completo_print_unicode_e_importacao_do_projeto(self) -> None:
        with tempfile.TemporaryDirectory() as project:
            Path(project, "auxiliar.py").write_text("SAUDACAO = 'olá'\n", encoding="utf-8")
            proc = self.start(project)
            try:
                script = textwrap.dedent("""
                    import auxiliar

                    print("ação:", auxiliar.SAUDACAO)

                    @form.btnOk.on_click
                    def clicou():
                        print("clicou!", form.txtNome.value)
                        form.lblInfo.text = auxiliar.SAUDACAO + " " + form.txtNome.value
                """)
                self.send(proc, {"type": "ping"})
                self.assertEqual(self.read_until(proc, "pong")[-1], {"type": "pong"})
                self.send(proc, {"type": "load_form", "form": {"title": "T"}, "components": comps(),
                                 "script": script, "script_name": "Main.py"})
                got = self.read_until(proc, "loaded")
                self.assertIn({"type": "console", "level": "info", "text": "ação: olá"}, got)
                self.assertEqual(got[-1], {"type": "loaded", "ok": True})

                self.send(proc, {"type": "sync", "id": "txtNome", "prop": "value", "value": "João"})
                self.send(proc, {"type": "event", "id": "btnOk", "name": "click", "args": {}})
                self.send(proc, {"type": "ping"})
                got = self.read_until(proc, "pong")
                self.assertIn({"type": "console", "level": "info", "text": "clicou! João"}, got)
                patch = next(m for m in got if m["type"] == "patch")
                self.assertEqual(patch["changes"], [{"id": "lblInfo", "prop": "text", "value": "olá João"}])

                self.send(proc, {"type": "shutdown"})
                self.assertEqual(proc.wait(timeout=10), 0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                for stream in (proc.stdin, proc.stdout, proc.stderr):
                    if stream:
                        stream.close()

    def test_erro_e_mensagem_invalida_nao_derrubam_o_processo(self) -> None:
        with tempfile.TemporaryDirectory() as project:
            proc = self.start(project)
            try:
                assert proc.stdin
                proc.stdin.write("isto não é json\n")
                proc.stdin.flush()
                self.send(proc, {"type": "load_form", "form": {}, "components": comps(),
                                 "script": "1/0", "script_name": "Main.py"})
                got = self.read_until(proc, "loaded")
                levels = [(m["level"], m.get("line")) for m in got if m["type"] == "console"]
                self.assertEqual(levels[0][0], "warn")
                self.assertIn(("error", 1), levels)
                self.send(proc, {"type": "ping"})
                self.read_until(proc, "pong")  # continua vivo
                proc.stdin.close()  # a IDE fechou o canal: o processo encerra sozinho
                self.assertEqual(proc.wait(timeout=10), 0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                for stream in (proc.stdout, proc.stderr):
                    if stream:
                        stream.close()


if __name__ == "__main__":
    unittest.main()


class RegistryTest(unittest.TestCase):
    """O runtime lê o MESMO registry/components.json da IDE: nada de tabelas duplicadas."""

    def test_todo_metodo_do_registro_existe_no_componente(self) -> None:
        from vform_runtime import registry
        from vform_runtime.components import Component

        for name in registry.DATA["methods"]:
            self.assertTrue(callable(getattr(Component, name, None)), f"Component.{name} não existe")
        for comp_type, methods in registry.METHODS.items():
            self.assertLessEqual(methods, set(registry.DATA["methods"]), comp_type)

    def test_eventos_e_listas_vem_do_registro(self) -> None:
        from vform_runtime import registry

        self.assertEqual(registry.EVENTS["ListBox"], ("change", "double_click"))
        self.assertEqual(registry.list_props("Table"), frozenset({"columns", "rows"}))
        self.assertEqual(registry.ALIASES["TextField"], {"text": "value"})
        self.assertIn("ComboBox", registry.SELECTED_ITEM)
        self.assertNotIn("Tabs", registry.SELECTED_ITEM)

    def test_metodo_fora_do_tipo_da_erro_claro(self) -> None:
        h = Harness()
        h.load("form.btnOk.add_item('x')")
        self.assertIn("não tem o método 'add_item'", h.errors()[0]["text"])


class CommonApiTest(unittest.TestCase):
    def changes(self, h: Harness) -> list:
        return [c for m in h.of("patch") for c in m["changes"]]

    def test_mostrar_ocultar_habilitar_e_dica(self) -> None:
        h = Harness()
        h.load("""
            form.btnOk.hide()
            form.btnOk.disable()
            form.btnOk.set_tooltip("Salva")
            form.btnOk.show()
        """)
        self.assertEqual(
            self.changes(h),
            [
                {"id": "btnOk", "prop": "visible", "value": True},  # a última escrita vence
                {"id": "btnOk", "prop": "enabled", "value": False},
                {"id": "btnOk", "prop": "tooltip", "value": "Salva"},
            ],
        )

    def test_set_visible_e_set_enabled_aceitam_booleanos(self) -> None:
        h = Harness()
        h.load("form.btnOk.set_visible(0)\nform.btnOk.set_enabled(False)")
        self.assertEqual(
            self.changes(h),
            [{"id": "btnOk", "prop": "visible", "value": False}, {"id": "btnOk", "prop": "enabled", "value": False}],
        )

    def test_posicao_e_tamanho_validam_os_argumentos(self) -> None:
        h = Harness()
        h.load("form.btnOk.set_position(10, 20.5)\nform.btnOk.set_size(100, 40)")
        got = {(c["prop"], c["value"]) for c in self.changes(h)}
        self.assertEqual(got, {("x", 10), ("y", 20.5), ("height", 40)})  # a largura já era 100: não muda
        for bad in ("form.btnOk.set_position('a', 1)", "form.btnOk.set_size(0, 10)", "form.btnOk.set_size(True, 10)"):
            h = Harness()
            h.load(bad)
            self.assertEqual(len(h.errors()), 1, bad)

    def test_focus_envia_comando_depois_das_alteracoes(self) -> None:
        h = Harness()
        h.load("form.txtNome.text = 'novo'\nform.txtNome.focus()\nform.txtNome.blur()")
        kinds = [m["type"] for m in h.sent]
        self.assertLess(kinds.index("patch"), kinds.index("command"))
        self.assertEqual(h.of("command"), [
            {"type": "command", "id": "txtNome", "name": "focus"},
            {"type": "command", "id": "txtNome", "name": "blur"},
        ])

    def test_metodos_que_o_tipo_nao_tem_dao_erro_claro(self) -> None:
        h = Harness()
        h.load("form.lblInfo.focus()")  # Label não recebe foco
        self.assertIn("não tem o método 'focus'", h.errors()[0]["text"])

    def test_reset_volta_ao_padrao_sem_mexer_em_posicao_e_tamanho(self) -> None:
        h = Harness()
        h.load("""
            form.cbUF.add_item("SP")
            form.cbUF.selected_index = 1
            form.cbUF.set_tooltip("x")
            form.cbUF.set_position(5, 5)
            form.cbUF.reset()
        """)
        got = {c["prop"]: c["value"] for c in self.changes(h)}
        self.assertEqual((got["x"], got["y"]), (5, 5))  # posição e tamanho não são tocados pelo reset
        self.assertNotIn("width", got)
        self.assertEqual(got["items"], ["Item 1", "Item 2"])  # volta aos valores padrão do tipo (os do registro)
        self.assertEqual((got["selectedIndex"], got["tooltip"]), (-1, ""))
        h.clear()
        h.event("cbUF", "change")  # o runtime segue vivo
        self.assertEqual(h.errors(), [])


class V03ComponentsTest(unittest.TestCase):
    def last(self, h: Harness) -> dict:
        return {(c["id"], c["prop"]): c["value"] for m in h.of("patch") for c in m["changes"]}

    def test_numeric_incrementa_pelo_passo_e_respeita_a_faixa(self) -> None:
        h = Harness()
        h.load("""
            form.num.increment()
            form.num.increment()
            form.num.increment()
            form.num.increment()
        """)
        self.assertEqual(self.last(h)[("num", "value")], 10)  # 5 → 7 → 9 → 10 (máximo)
        h = Harness()
        h.load("form.num.decrement(100)")
        self.assertEqual(self.last(h)[("num", "value")], 0)

    def test_set_range_ajusta_o_valor_e_valida(self) -> None:
        h = Harness()
        h.load("form.num.set_range(6, 8)")
        self.assertEqual(self.last(h), {("num", "minValue"): 6, ("num", "maxValue"): 8, ("num", "value"): 6})
        h = Harness()
        h.load("form.num.set_range(9, 1)")
        self.assertIn("não pode ser maior", h.errors()[0]["text"])

    def test_slider_com_passo_decimal_nao_acumula_erro_de_ponto_flutuante(self) -> None:
        h = Harness()
        h.load("""
            form.sld.value = 0.1
            form.sld.increment()
            form.sld.increment()
        """)
        self.assertEqual(self.last(h)[("sld", "value")], 0.3)

    def test_progressbar_incrementa_um_por_padrao_ou_o_que_for_pedido(self) -> None:
        h = Harness()
        h.load("form.pb.increment(25)")
        self.assertEqual(self.last(h)[("pb", "value")], 65)
        h = Harness()
        h.load("form.pb.decrement()")  # barra de progresso não tem decrement
        self.assertIn("não tem o método 'decrement'", h.errors()[0]["text"])

    def test_interruptor(self) -> None:
        h = Harness()
        h.load("""
            form.sw.toggle()
            form.sw.turn_off()
            form.sw.turn_on()
        """)
        self.assertEqual(self.last(h)[("sw", "checked")], True)

    def test_data_de_hoje_e_limpar(self) -> None:
        import datetime

        h = Harness()
        h.load("form.dt.set_today()")
        self.assertEqual(self.last(h)[("dt", "value")], datetime.date.today().isoformat())
        h = Harness()
        h.load("form.dt.clear()")
        self.assertEqual(self.last(h)[("dt", "value")], "")

    def test_senha_mostrar_esconder_limpar_e_apelido_text(self) -> None:
        h = Harness()
        h.load("""
            form.pwd.show_password()
            assert form.pwd.text == "abc"
            form.pwd.clear()
        """)
        self.assertEqual(self.last(h), {("pwd", "revealed"): True, ("pwd", "value"): ""})
        self.assertEqual(h.errors(), [])

    def test_link_open_pede_a_ide_para_abrir(self) -> None:
        h = Harness()
        h.load("form.lnk.open()")
        self.assertEqual(h.of("open_url"), [{"type": "open_url", "url": "https://exemplo.org/"}])

    def test_clear_de_lista_continua_funcionando(self) -> None:
        h = Harness()
        h.load("form.lst.clear()")
        self.assertEqual(self.last(h)[("lst", "items")], [])
