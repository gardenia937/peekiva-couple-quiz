#!/usr/bin/env python3
"""Peekiva Couple Quiz — one-command deploy to Cloudflare.

Usage:
  export CF_API_TOKEN="..."   # Pages + Workers + D1 edit permission
  python3 tools/deploy.py --all        # migrate D1 + upload worker + deploy pages
  python3 tools/deploy.py --worker     # backend only
  python3 tools/deploy.py --pages      # frontend only
  python3 tools/deploy.py --migrate    # database schema only

Nothing secret is stored in this repo. The token lives only in your
environment / password manager, never in code.
"""
import argparse, base64, hashlib, json, os, sys, urllib.request, urllib.error

ACCT = "4458724be64adab0a87ba0dbf6c3bc8e"
WORKER_NAME = "couple-quiz-api"
WORKER_URL = "https://couple-quiz-api.gardenia937.workers.dev"
PAGES_PROJECT = "couple-quiz"
D1_UUID = "14942329-6335-4006-bab4-21cada5aaf80"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(ROOT, "public")
PAGES_ORIGIN = "https://couple-quiz-ajh.pages.dev"

TOKEN = os.environ.get("CF_API_TOKEN", "").strip()
if not TOKEN:
    sys.exit("Missing CF_API_TOKEN. Run: export CF_API_TOKEN='paste-your-token-here'")

API = "https://api.cloudflare.com/client/v4"

def cf_json(method, url, payload=None, token=None, timeout=120, retries=5):
    import time
    last = (0, {"raw": "network failed"})
    for i in range(retries):
        rq = urllib.request.Request(url, method=method)
        if payload is not None:
            rq.data = json.dumps(payload).encode()
            rq.add_header("Content-Type", "application/json")
        rq.add_header("Authorization", "Bearer " + (token or TOKEN))
        try:
            with urllib.request.urlopen(rq, timeout=timeout) as resp:
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw or b"{}")
            except Exception:
                return e.code, {"raw": raw[:500].decode("utf8", "ignore")}
        except Exception as e:
            last = (0, {"raw": f"network error ({i+1}/{retries}): {e}"})
            time.sleep(3)
    return last

def migrate():
    raw = open(os.path.join(ROOT, "schema.sql")).read()
    no_comments = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("--"))
    stmts = [s.strip() for s in no_comments.split(";") if s.strip()]
    for s in stmts:
        st, j = cf_json("POST", f"{API}/accounts/{ACCT}/d1/database/{D1_UUID}/query", {"sql": s})
        if not j.get("success"):
            sys.exit("[migrate] FAILED: " + json.dumps(j)[:400])
    print(f"[migrate] OK ({len(stmts)} statements)")

def upload_worker():
    import io
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2025-06-01",
        "bindings": [
            {"name": "DB", "type": "d1", "id": D1_UUID,
             "database_name": "couple-quiz-db", "database_id": D1_UUID},
            {"name": "ALLOWED_ORIGIN", "type": "plain_text", "text": PAGES_ORIGIN},
            {"name": "PUBLIC_BASE_URL", "type": "plain_text", "text": PAGES_ORIGIN},
            {"name": "DISCOVER_URL", "type": "plain_text", "text": "https://peekiva.com"},
        ],
    }
    code = open(os.path.join(ROOT, "worker.js"), "rb").read()
    boundary = "----cq" + os.urandom(8).hex()
    buf = b""
    def part(name, ctype, data, filename=None):
        nonlocal buf
        buf += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"".encode()
        if filename:
            buf += f"; filename=\"{filename}\"".encode()
        buf += b"\r\n"
        if ctype:
            buf += f"Content-Type: {ctype}\r\n".encode()
        buf += b"\r\n" + data + b"\r\n"
    part("metadata", "application/json", json.dumps(metadata).encode())
    part("worker.js", "application/javascript+module", code, filename="worker.js")
    buf += f"--{boundary}--\r\n".encode()
    rq = urllib.request.Request(
        f"{API}/accounts/{ACCT}/workers/scripts/{WORKER_NAME}",
        method="PUT", data=buf)
    rq.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    rq.add_header("Authorization", "Bearer " + TOKEN)
    j = None
    for i in range(5):
        try:
            with urllib.request.urlopen(rq, timeout=120) as resp:
                j = json.loads(resp.read() or b"{}")
            break
        except urllib.error.HTTPError as e:
            sys.exit("[worker] HTTP %s -> %s" % (e.code, e.read()[:800].decode("utf8", "ignore")))
        except Exception as e:
            import time as _t
            print(f"[worker] network blip ({i+1}/5), retrying…")
            _t.sleep(4)
    if j is None:
        sys.exit("[worker] upload failed after retries (network). Please run again.")
    if not j.get("success"):
        sys.exit("[worker] FAILED: " + json.dumps(j)[:800])
    print("[worker] OK -> " + WORKER_URL)
    # New workers uploaded via the raw API have workers.dev DISABLED by
    # default (wrangler enables it automatically). Without this step the
    # worker answers HTTP 404 "error code: 1042".
    st, sub = cf_json("POST",
        f"{API}/accounts/{ACCT}/workers/scripts/{WORKER_NAME}/subdomain",
        {"enabled": True})
    if not sub.get("success"):
        sys.exit("[worker] subdomain enable FAILED: " + json.dumps(sub)[:400])
    print("[worker] workers.dev enabled:", sub["result"])

CONTENT_TYPES = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain",
}

def deploy_pages():
    # 1) ensure project exists (direct-upload mode, no git integration needed)
    st, j = cf_json("GET", f"{API}/accounts/{ACCT}/pages/projects/{PAGES_PROJECT}")
    if not (j.get("success") and j.get("result")):
        st, j = cf_json("POST", f"{API}/accounts/{ACCT}/pages/projects",
                         {"name": PAGES_PROJECT, "production_branch": "main"})
        if not j.get("success"):
            sys.exit("[pages] create project FAILED: " + json.dumps(j)[:500])
        print("[pages] project created")
    # 2) upload-token (JWT for asset API)
    st, j = cf_json("GET", f"{API}/accounts/{ACCT}/pages/projects/{PAGES_PROJECT}/upload-token")
    if not j.get("success"):
        sys.exit("[pages] upload-token FAILED: " + json.dumps(j)[:400])
    jwt = j["result"]["jwt"]
    # 3) read files
    files = {}
    for name in sorted(os.listdir(PUBLIC_DIR)):
        if name in ("_headers", "_redirects"):
            continue  # sent as special deployment parts, not servable assets
        p = os.path.join(PUBLIC_DIR, name)
        if os.path.isfile(p):
            files["/" + name] = open(p, "rb").read()
    if "/index.html" not in files:
        sys.exit("[pages] public/index.html missing")
    hashes, blobs = {}, {}
    for path, data in files.items():
        h = hashlib.md5(data).hexdigest()
        hashes[path] = h
        # remember one real filename per hash for the content type
        if h not in blobs or (blobs[h][0] == "/" and path != "/"):
            blobs[h] = (path, data)
    # 4) check-missing + upload (with correct content type per file)
    st, res = cf_json("POST", f"{API}/pages/assets/check-missing",
                      {"hashes": list(blobs)}, token=jwt)
    missing = set(res.get("result") or [])
    for h, (path, data) in blobs.items():
        if h not in missing:
            continue
        ext = os.path.splitext(path)[1].lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        payload = [{"key": h, "value": base64.b64encode(data).decode(),
                    "metadata": {"contentType": ctype}, "base64": True}]
        st, up = cf_json("POST", f"{API}/pages/assets/upload", payload, token=jwt)
        if not up.get("success"):
            sys.exit("[pages] asset upload FAILED: " + json.dumps(up)[:500])
    cf_json("POST", f"{API}/pages/assets/upsert-hashes", {"hashes": list(blobs)}, token=jwt)
    print(f"[pages] assets ready ({len(blobs)} unique, {len(missing)} uploaded)")
    # 5) create deployment (manifest + _headers + _redirects special files)
    boundary = "----cq" + os.urandom(8).hex()
    buf = b""
    def field(name, ctype, data):
        nonlocal buf
        buf += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"".encode()
        if ctype:
            buf += f"; filename=\"{name}\"".encode()
            buf += b"\r\nContent-Type: " + ctype.encode()
        buf += b"\r\n\r\n" + data + b"\r\n"
    manifest = {p: h for p, h in hashes.items() if p != "/"}
    field("manifest", None, json.dumps(manifest).encode())
    for special in ("_headers", "_redirects"):
        p = os.path.join(PUBLIC_DIR, special)
        if os.path.exists(p):
            field(special, "text/plain", open(p, "rb").read())
    buf += f"--{boundary}--\r\n".encode()
    rq = urllib.request.Request(
        f"{API}/accounts/{ACCT}/pages/projects/{PAGES_PROJECT}/deployments",
        method="POST", data=buf)
    rq.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    rq.add_header("Authorization", "Bearer " + TOKEN)
    ur = None
    for i in range(5):
        try:
            with urllib.request.urlopen(rq, timeout=120) as resp:
                ur = json.loads(resp.read() or b"{}")
            break
        except urllib.error.HTTPError as e:
            sys.exit("[pages] deployment HTTP %s -> %s" % (e.code, e.read()[:800].decode("utf8", "ignore")))
        except Exception as e:
            import time as _t
            print(f"[pages] network blip ({i+1}/5), retrying…")
            _t.sleep(4)
    if ur is None:
        sys.exit("[pages] deployment failed after retries (network). Please run again.")
    if not ur.get("success"):
        sys.exit("[pages] deployment FAILED: " + json.dumps(ur)[:800])
    d = ur["result"]
    print("[pages] deployment id=%s\n        url=%s" % (d.get("id"), d.get("url")))
    print("        site: " + PAGES_ORIGIN)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--worker", action="store_true")
    ap.add_argument("--pages", action="store_true")
    ap.add_argument("--migrate", action="store_true")
    a = ap.parse_args()
    if not (a.all or a.worker or a.pages or a.migrate):
        a.all = True
    if a.all or a.migrate:
        migrate()
    if a.all or a.worker:
        upload_worker()
    if a.all or a.pages:
        deploy_pages()
    print("DONE")
