"""Reproduksi: ekstensi di-reload saat tab x.com masih terbuka (Extension context invalidated)."""
import os, sys, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "ext"
shutil.rmtree(EXT, ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "*.md"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('mode: "closed"', 'mode: "open"'))
errors = []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profile-stale"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900},
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8443, MAP api.x.com:443 127.0.0.1:8443, MAP pbs.twimg.com:443 127.0.0.1:8443, MAP * ~NOTFOUND", "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_NAME" not in m.text and "404" not in m.text else None)
    page.goto("https://x.com/home"); page.wait_for_timeout(1500)
    P = "#sapux-host >> "
    page.locator(P + ".fab").click()
    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_contain_text("Scan finished", timeout=20000)
    page.get_by_role("button", name="Close panel").click()
    print("1. Scan OK, panel ditutup")

    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    try:
        sw.evaluate("chrome.runtime.reload()")
    except Exception:
        pass  # worker mati saat reload, itu normal
    page.wait_for_timeout(1500)
    print("2. Ekstensi di-reload (tab lama tidak di-refresh)")

    page.locator(P + ".fab").first.click()
    expect(page.locator(P + ".empty-title").first).to_have_text("SapuX was updated", timeout=5000)
    page.screenshot(path=str(HERE / "7-stale.png"))
    print("3. Tab lama menampilkan layar 'SapuX baru diperbarui'")
    bad = [e for e in errors if "context invalidated" in e.lower()]
    assert not bad, bad
    print("4. Tidak ada error 'Extension context invalidated' yang lolos")

    ctx.close()
print("\nSTALE E2E PASSED")
