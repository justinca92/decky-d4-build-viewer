"""D4 Build Viewer: Decky backend.

Everything this plugin writes lives in three Decky-managed folders:
  DECKY_PLUGIN_SETTINGS_DIR  settings.json
  DECKY_PLUGIN_RUNTIME_DIR   builds/<id>.json (one file per saved build, icons embedded), datasets/<lang>.json
  DECKY_PLUGIN_LOG_DIR       plugin log
`_uninstall` deletes all three, so removing the plugin from Decky leaves nothing behind.
Downloaded pages and icon sources are only kept in memory.
"""

import asyncio
import base64
import json
import logging
import os
import re
import secrets
import shutil
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

import decky

# Privacy: the only outbound requests are plain GETs to the three InfinityBuilds hosts below, made when the
# user loads a build. No cookies, no referer, no analytics; a generic user agent that carries no device,
# account or plugin details; redirects to any other host are refused.
UA = "Mozilla/5.0 (X11; Linux x86_64)"
ALLOWED_HOSTS = {"infinitybuilds.gg", "www.infinitybuilds.gg", "data.infinitybuilds.gg", "assets.infinitybuilds.gg"}
PAGE_RE = re.compile(r"^https://(www\.)?infinitybuilds\.gg/[\w-]+/builds/[\w-]+/?(\?.*)?$")
ASSET_RE = re.compile(r"^https://assets\.infinitybuilds\.gg/assets/d4/[\w./-]+\.(webp|png)$")
DATA_BASE = "https://data.infinitybuilds.gg/datasets/diablo4/"
DATA_LANGS = ("ko", "en", "zh")
ID_RE = re.compile(r"^[\w-]{1,120}$")
DEFAULT_PORT = 8765
INDEX_SCHEMA = 3  # bump when the cached dataset index shape changes
MAX_BODY = 16 * 1024


def _settings_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")


def _builds_dir() -> str:
    return os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "builds")


def _datasets_dir() -> str:
    return os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "datasets")


def _ssl_context() -> ssl.SSLContext:
    # Decky's bundled Python has no default CA store, so HTTPS fails with CERTIFICATE_VERIFY_FAILED.
    # Use certifi (shipped with Decky) or the SteamOS/Arch system bundle. Verification stays on.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    for path in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ca-certificates/extracted/tls-ca-bundle.pem",
                 "/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"):
        if os.path.isfile(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


_SSL: Optional[ssl.SSLContext] = None
_OPENER = None


def _allowed(url: str) -> bool:
    p = urllib.parse.urlsplit(url)
    return p.scheme == "https" and (p.hostname or "") in ALLOWED_HOSTS


class _SameHostsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed(newurl):
            raise urllib.error.HTTPError(newurl, code, "redirect to a host outside the allowlist refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _http_get(url: str, timeout: float = 30) -> bytes:
    global _SSL, _OPENER
    if not _allowed(url):
        raise ValueError("host not allowed")
    if _OPENER is None:
        _SSL = _ssl_context()
        _OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=_SSL), _SameHostsRedirect())
        _OPENER.addheaders = []  # no default Python-urllib user agent
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity", "Accept": "*/*"})
    with _OPENER.open(req, timeout=timeout) as r:
        return r.read()


def _dir_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _lan_ip() -> str:
    # UDP "connect" only picks the outgoing interface; no packet is sent.
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


PHONE_PAGE = {
    "ko": {
        "title": "스팀덱으로 빌드 보내기",
        "lead": "인피니티빌드(infinitybuilds.gg)에서 빌드 페이지 주소를 복사해 붙여넣고 전송하세요. 다른 사이트 링크는 지원하지 않습니다.",
        "wifi": "이 페이지가 열렸다면 스팀덱과 같은 Wi-Fi에 연결된 상태입니다.",
        "label": "빌드 페이지 링크",
        "send": "스팀덱으로 전송",
        "bad": "infinitybuilds.gg/…/builds/… 형식의 링크가 필요해요.",
        "ok": "전송했어요. 스팀덱 화면을 확인하세요.",
        "fail": "전송하지 못했어요. 스팀덱에서 QR 화면이 열려 있는지, 같은 Wi-Fi인지 확인하세요.",
    },
    "en": {
        "title": "Send a build to your Steam Deck",
        "lead": "Copy a build page address from InfinityBuilds (infinitybuilds.gg), paste it here and send. Links from other sites aren't supported.",
        "wifi": "If this page opened, your phone is on the same Wi-Fi as the Deck.",
        "label": "Build page link",
        "send": "Send to Steam Deck",
        "bad": "Needs an infinitybuilds.gg/…/builds/… link.",
        "ok": "Sent. Check your Steam Deck.",
        "fail": "Couldn't send. Make sure the QR screen is open on the Deck and you're on the same Wi-Fi.",
    },
}


def _phone_html(lang: str) -> str:
    s = PHONE_PAGE[lang]
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>{s['title']}</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}
body{{margin:0;background:#0f1318;color:#e3e6e8;font:16px/1.5 system-ui,sans-serif;padding:24px 16px}}
main{{max-width:460px;margin:0 auto;display:grid;gap:14px}}h1{{margin:0;font-size:22px}}p{{margin:0;color:#8b929a;font-size:14px}}
label{{font-size:13px;color:#8b929a}}
textarea{{width:100%;min-height:96px;background:#1a2029;color:#e3e6e8;border:1px solid #2a323d;border-radius:10px;padding:12px;font:14px/1.4 ui-monospace,monospace}}
button{{width:100%;border:0;border-radius:10px;padding:15px;font:600 17px system-ui,sans-serif;background:#1a9fff;color:#fff}}
button:disabled{{background:#2a323d;color:#8b929a}}.m{{padding:12px;border-radius:10px;font-size:14px;background:#1a2029}}
.ok{{color:#a5e09a;background:#1f3326}}.bad{{color:#f2a3a3;background:#3a1c1c}}
</style></head><body><main>
<h1>{s['title']}</h1><p>{s['lead']}</p><div class="m">{s['wifi']}</div>
<label for="u">{s['label']}</label>
<textarea id="u" placeholder="https://infinitybuilds.gg/{lang}/builds/…" autocapitalize="off" spellcheck="false"></textarea>
<button id="go">{s['send']}</button><div id="m" class="m" hidden></div>
</main><script>
const u=document.getElementById("u"),go=document.getElementById("go"),m=document.getElementById("m");
const show=(t,c)=>{{m.hidden=false;m.className="m "+c;m.textContent=t;}};
go.onclick=async()=>{{
  const link=(u.value.match(/https?:\\/\\/\\S+/)||[""])[0];
  if(!/infinitybuilds\\.gg\\/[\\w-]+\\/builds\\//.test(link))return show({json.dumps(s['bad'])},"bad");
  go.disabled=true;
  try{{const r=await fetch(location.pathname,{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify({{url:link}})}});
    if(!r.ok)throw 0;show({json.dumps(s['ok'])},"ok");u.value="";}}
  catch(e){{show({json.dumps(s['fail'])},"bad");}}
  go.disabled=false;
}};
</script></body></html>"""


class Plugin:
    server: Optional[asyncio.AbstractServer] = None
    port: int = DEFAULT_PORT
    datasets: dict = {}
    token: str = ""

    # ---------- lifecycle ----------
    async def _main(self):
        self.loop = asyncio.get_event_loop()
        self.server = None
        self.token = ""
        self.datasets = {}
        self.dataset_locks = {}
        os.makedirs(_builds_dir(), exist_ok=True)
        os.makedirs(_datasets_dir(), exist_ok=True)
        settings = self._read_settings()
        self.port = int(settings.get("port", DEFAULT_PORT))
        decky.logger.info("D4 Build Viewer loaded")

    async def _unload(self):
        await self.stop_receiver()
        decky.logger.info("D4 Build Viewer unloaded")

    async def _uninstall(self):
        # Remove everything this plugin ever wrote. Decky deletes the plugin folder itself afterwards.
        await self.stop_receiver()
        for handler in list(decky.logger.handlers):
            try:
                handler.close()
                decky.logger.removeHandler(handler)
            except Exception:
                pass
        logging.shutdown()
        for d in (decky.DECKY_PLUGIN_RUNTIME_DIR, decky.DECKY_PLUGIN_SETTINGS_DIR, decky.DECKY_PLUGIN_LOG_DIR):
            shutil.rmtree(d, ignore_errors=True)

    # ---------- settings ----------
    def _read_settings(self) -> dict:
        try:
            with open(_settings_path(), "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    async def get_version(self) -> str:
        return str(decky.DECKY_PLUGIN_VERSION)

    # ---------- phone receiver (open only while the QR screen is shown) ----------
    # The QR carries a fresh one-time token (/s/<token>); only a phone that scanned it can send a link.
    async def start_receiver(self) -> dict:
        if self.server is None:
            try:
                self.server = await asyncio.start_server(self._handle, host="0.0.0.0", port=self.port)
                decky.logger.info(f"receiver listening on {self.port}")
            except OSError as e:
                decky.logger.error(f"receiver failed: {e}")
                return {"ok": False, "error": str(e), "ip": _lan_ip(), "port": self.port, "token": ""}
        self.token = secrets.token_urlsafe(9)
        return {"ok": True, "ip": _lan_ip(), "port": self.port, "token": self.token}

    async def stop_receiver(self) -> None:
        self.token = ""
        if self.server is not None:
            self.server.close()
            try:
                await self.server.wait_closed()
            except Exception:
                pass
            self.server = None
            decky.logger.info("receiver stopped")

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
            lines = head.decode("latin-1").split("\r\n")
            method, path = (lines[0].split(" ") + ["", ""])[:2]
            headers = {}
            for ln in lines[1:]:
                if ":" in ln:
                    k, v = ln.split(":", 1)
                    headers[k.strip().lower()] = v.strip()
            lang = "ko" if headers.get("accept-language", "").lower().startswith("ko") else "en"
            route = path.split("?")[0]
            valid = bool(self.token) and secrets.compare_digest(route.encode("utf-8", "replace"), ("/s/" + self.token).encode("ascii"))
            if not valid:
                await self._send(writer, 404, "text/plain", b"not found")
            elif method == "POST":
                n = min(int(headers.get("content-length", "0") or 0), MAX_BODY)
                body = await asyncio.wait_for(reader.readexactly(n), timeout=10) if n else b""
                url = str(json.loads(body.decode("utf-8") or "{}").get("url", "")).strip()
                if not PAGE_RE.match(url):
                    await self._send(writer, 400, "application/json", b'{"ok":false}')
                    return
                await decky.emit("link_received", url)
                await self._send(writer, 200, "application/json", b'{"ok":true}')
            elif method == "GET":
                await self._send(writer, 200, "text/html; charset=utf-8", _phone_html(lang).encode("utf-8"))
            else:
                await self._send(writer, 404, "text/plain", b"not found")
        except Exception as e:
            decky.logger.warning(f"receiver request failed: {e}")
        finally:
            try:
                writer.close()
            except Exception:
                pass

    async def _send(self, writer: asyncio.StreamWriter, code: int, ctype: str, body: bytes):
        reason = {200: "OK", 400: "Bad Request", 404: "Not Found"}.get(code, "OK")
        writer.write(
            f"HTTP/1.1 {code} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
            f"Cache-Control: no-store\r\nConnection: close\r\n\r\n".encode("latin-1") + body
        )
        await writer.drain()

    # ---------- network helpers for the frontend ----------
    async def fetch_page(self, url: str) -> dict:
        if not PAGE_RE.match(url or ""):
            return {"ok": False, "error": "bad url"}
        try:
            data = await self.loop.run_in_executor(None, _http_get, url)
            return {"ok": True, "html": data.decode("utf-8", errors="replace"), "bytes": len(data)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def fetch_asset(self, url: str) -> dict:
        """Icon source as a data URI (memory only). The frontend crops it and stores the small result."""
        if not ASSET_RE.match(url or ""):
            return {"ok": False, "error": "bad url"}
        try:
            data = await self.loop.run_in_executor(None, _http_get, url)
            mime = "image/png" if url.endswith(".png") else "image/webp"
            return {"ok": True, "uri": f"data:{mime};base64," + base64.b64encode(data).decode("ascii")}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---------- name datasets (reduced index cached per language) ----------
    async def get_dataset(self, lang: str) -> dict:
        if lang not in ("ko", "en"):
            lang = "en"
        if lang in self.datasets:
            return self.datasets[lang]
        lock = self.dataset_locks.setdefault(lang, asyncio.Lock())
        async with lock:
            if lang in self.datasets:
                return self.datasets[lang]
            path = os.path.join(_datasets_dir(), f"{lang}.json")
            manifest = None
            try:
                manifest = json.loads(await self.loop.run_in_executor(None, _http_get, DATA_BASE + lang + "/manifest.json", 15))
            except Exception as e:
                decky.logger.warning(f"manifest unavailable, using cache if any: {e}")
            cached = None
            try:
                with open(path, "r", encoding="utf-8") as f:
                    cached = json.load(f)
            except (OSError, ValueError):
                pass
            if cached and cached.get("schema") == INDEX_SCHEMA and (manifest is None or cached.get("version") == manifest.get("version")):
                self.datasets[lang] = cached
                return cached
            if manifest is None:
                return {"error": "dataset unavailable"}
            index = await self._build_index(lang, manifest)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(index, f, ensure_ascii=False)
            self.datasets[lang] = index
            return index

    async def _build_index(self, lang: str, man: dict) -> dict:
        sh = man["shards"]
        files = {
            "core": sh["core"], "items": sh["gear"]["items"], "affixes": sh["gear"]["affixes"], "aspects": sh["gear"]["aspects"],
            "layouts": sh["skills"], "boards": sh["paragon"]["boards"], "glyphs": sh["extras"]["glyphs"],
            "charms": sh["extras"]["charms"], "sets": sh["extras"]["sets"],
        }
        labels, set_members, set_names, nodes, layouts = {}, {}, {}, [], {}
        done = 0
        for key, fname in files.items():
            raw = await self.loop.run_in_executor(None, _http_get, f"{DATA_BASE}{lang}/{fname}?v={man['version']}", 60)
            d = json.loads(raw)
            del raw
            if key == "items":
                for x in d["gear"]["items"]:
                    labels[x["id"]] = x.get("label")
            elif key == "affixes":
                for x in d["gear"]["affixes"]:
                    labels[x["id"]] = x.get("label")
            elif key == "aspects":
                for x in d["gear"]["aspects"]:
                    labels[x["id"]] = x.get("label")
            elif key == "boards":
                for x in d["paragon"]["boards"]:
                    labels[x["id"]] = x.get("label")
            elif key == "glyphs":
                for x in d["paragon"]["glyphs"]:
                    labels[x["id"]] = x.get("label")
            elif key == "charms":
                for x in d["gear"]["charms"]:
                    labels[x["id"]] = x.get("name")
            elif key == "sets":
                for st in d["gear"]["sets"]:
                    set_names[st.get("id")] = st.get("name")
                    for m in st.get("members") or []:
                        set_members[m] = st.get("name")
            elif key == "core":
                nodes = [[n["sourceId"], n.get("classId"), n.get("label")] for n in d["skills"]["nodes"]]
            elif key == "layouts":
                for cls, lay in d["skills"]["layouts"].items():
                    layouts[cls] = [[n["id"], n.get("powerName"), n.get("nodeKind"), (n.get("scrapedName") or "").strip()] for n in lay.get("nodes", [])]
            del d
            done += 1
            await decky.emit("dataset_progress", lang, done, len(files))
        labels = {k: v for k, v in labels.items() if v}
        return {"schema": INDEX_SCHEMA, "version": man["version"], "labels": labels, "setMembers": set_members,
                "setNames": {k: v for k, v in set_names.items() if k and v}, "nodes": nodes, "layouts": layouts}

    # Guide text sometimes mentions things by name only, in the author's language (<a …>@The Eightfold Idol</a>,
    # <a …>@死亡之握</a>). get_alt_names(lang, src) maps names in `src` to names in `lang` for items, aspects,
    # paragon boards, glyphs, charms and talisman sets. Built only when a guide needs it, then cached.
    async def get_alt_names(self, lang: str, src: str) -> dict:
        if lang not in DATA_LANGS or src not in DATA_LANGS or lang == src:
            return {}
        key = f"alt-{src}-{lang}"
        if key in self.datasets:
            return self.datasets[key]
        lock = self.dataset_locks.setdefault(key, asyncio.Lock())
        async with lock:
            if key in self.datasets:
                return self.datasets[key]
            local = await self.get_dataset(lang)
            if not local or "labels" not in local:
                return {}
            path = os.path.join(_datasets_dir(), key + ".json")
            man = None
            try:
                man = json.loads(await self.loop.run_in_executor(None, _http_get, DATA_BASE + src + "/manifest.json", 15))
            except Exception as e:
                decky.logger.warning(f"{src} manifest unavailable, using cache if any: {e}")
            try:
                with open(path, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                if cached.get("schema") == INDEX_SCHEMA and cached.get("local") == local.get("version") and (man is None or cached.get("version") == man.get("version")):
                    self.datasets[key] = cached["names"]
                    return cached["names"]
            except (OSError, ValueError, AttributeError):
                pass
            if man is None:
                return {}
            sh = man["shards"]
            files = {"items": sh["gear"]["items"], "aspects": sh["gear"]["aspects"], "boards": sh["paragon"]["boards"],
                     "glyphs": sh["extras"]["glyphs"], "charms": sh["extras"]["charms"], "sets": sh["extras"]["sets"]}
            labels, set_names, names = local["labels"], local.get("setNames", {}), {}
            done = 0
            for k, fname in files.items():
                raw = await self.loop.run_in_executor(None, _http_get, f"{DATA_BASE}{src}/{fname}?v={man['version']}", 60)
                d = json.loads(raw)
                del raw
                if k == "sets":
                    pairs = [(set_names.get(st.get("id")), st.get("name")) for st in d["gear"]["sets"]]
                else:
                    rows = {"items": d.get("gear", {}).get("items"), "aspects": d.get("gear", {}).get("aspects"),
                            "boards": d.get("paragon", {}).get("boards"), "glyphs": d.get("paragon", {}).get("glyphs"),
                            "charms": d.get("gear", {}).get("charms")}[k] or []
                    field = "name" if k == "charms" else "label"
                    pairs = [(labels.get(x.get("id")), x.get(field)) for x in rows]
                for loc, other in pairs:
                    if loc and other:
                        names.setdefault(other.lower(), loc)
                del d
                done += 1
                await decky.emit("dataset_progress", lang, done, len(files))
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"schema": INDEX_SCHEMA, "version": man["version"], "local": local.get("version"), "names": names}, f, ensure_ascii=False)
            self.datasets[key] = names
            return names

    async def clear_datasets(self) -> dict:
        self.datasets = {}
        n = _dir_size(_datasets_dir())
        shutil.rmtree(_datasets_dir(), ignore_errors=True)
        os.makedirs(_datasets_dir(), exist_ok=True)
        return {"ok": True, "bytes": n}

    # ---------- saved builds: builds/<id>.json, one file each ----------
    async def list_builds(self) -> list:
        out = []
        for f in os.listdir(_builds_dir()):
            if not f.endswith(".json"):
                continue
            p = os.path.join(_builds_dir(), f)
            try:
                with open(p, "r", encoding="utf-8") as fh:
                    b = json.load(fh)
                meta = b.get("meta", {})
                meta["id"] = f[:-5]
                meta["bytes"] = os.path.getsize(p)
                out.append(meta)
            except (OSError, ValueError):
                continue
        out.sort(key=lambda m: m.get("savedAt", 0), reverse=True)
        return out

    async def save_build(self, build_id: str, build: dict) -> dict:
        if not ID_RE.match(build_id or ""):
            return {"ok": False, "error": "bad id"}
        build.setdefault("meta", {})["savedAt"] = int(time.time() * 1000)
        p = os.path.join(_builds_dir(), build_id + ".json")
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(build, f, ensure_ascii=False)
        os.replace(tmp, p)
        return {"ok": True, "bytes": os.path.getsize(p)}

    async def load_build(self, build_id: str) -> Any:
        if not ID_RE.match(build_id or ""):
            return None
        try:
            with open(os.path.join(_builds_dir(), build_id + ".json"), "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    async def delete_build(self, build_id: str) -> dict:
        if not ID_RE.match(build_id or ""):
            return {"ok": False}
        p = os.path.join(_builds_dir(), build_id + ".json")
        n = os.path.getsize(p) if os.path.exists(p) else 0
        for q in (p, p + ".tmp"):
            try:
                os.remove(q)
            except OSError:
                pass
        return {"ok": True, "bytes": n}

    async def delete_all_builds(self) -> dict:
        n = _dir_size(_builds_dir())
        shutil.rmtree(_builds_dir(), ignore_errors=True)
        os.makedirs(_builds_dir(), exist_ok=True)
        return {"ok": True, "bytes": n}

    async def storage_info(self) -> dict:
        return {"builds": _dir_size(_builds_dir()), "datasets": _dir_size(_datasets_dir())}

    async def reset_all(self) -> dict:
        """Same cleanup as uninstalling, but the plugin keeps running: builds, dataset cache, settings, log."""
        await self.stop_receiver()
        self.datasets = {}
        n = _dir_size(decky.DECKY_PLUGIN_RUNTIME_DIR) + _dir_size(decky.DECKY_PLUGIN_SETTINGS_DIR) + _dir_size(decky.DECKY_PLUGIN_LOG_DIR)
        for d in (decky.DECKY_PLUGIN_RUNTIME_DIR, decky.DECKY_PLUGIN_SETTINGS_DIR):
            shutil.rmtree(d, ignore_errors=True)
        # the log file is open by this process: empty it instead of deleting it
        for root, _, files in os.walk(decky.DECKY_PLUGIN_LOG_DIR):
            for f in files:
                try:
                    open(os.path.join(root, f), "w").close()
                except OSError:
                    pass
        os.makedirs(_builds_dir(), exist_ok=True)
        os.makedirs(_datasets_dir(), exist_ok=True)
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        return {"ok": True, "bytes": n}

    async def log_error(self, stage: str, message: str, url: str = "") -> None:
        """Frontend failures (e.g. the site changed its page structure) go to the plugin log for bug reports."""
        decky.logger.error(f"[{str(stage)[:40]}] {str(message)[:500]} {str(url)[:200]}")
