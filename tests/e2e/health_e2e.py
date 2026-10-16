import os, sys, shutil, re, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "exthealth"
shutil.rmtree(EXT, ignore_errors=True); shutil.rmtree(HERE / "profilehealth", ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "docs", "*.md", ".git*"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))
def calls():
    f = HERE / "calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
errors = []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profilehealth"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900},
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8446, MAP api.x.com:443 127.0.0.1:8446, MAP pbs.twimg.com:443 127.0.0.1:8446, MAP * ~NOTFOUND", "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    P = "#sapux-host >> "
    def items(): return page.locator(P + ".health-item").all_inner_texts()
    def classes(): return [c.get_attribute("class").split()[-1] for c in page.locator(P + ".health-item").all()]
    page.goto("https://x.com/home?dark"); page.wait_for_timeout(1500)
    page.locator(P + ".fab").click()
    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_contain_text("Scan finished", timeout=20000)
    page.get_by_role("tab", name="Rules").click()
    # folds: only "who" open by default; summaries visible on closed ones
    opened = page.evaluate("[...document.querySelector('#sapux-host').shadowRoot.querySelectorAll('details.fold')].map(d => d.dataset.fold + ':' + d.open)")
    assert opened == ["who:true", "geo:false", "speed:false", "health:false", "backup:false"], opened
    expect(page.locator(P + 'details[data-fold="speed"] .fold-sum')).to_have_text("80/day · 20-45 s · break every 10")
    expect(page.locator(P + 'details[data-fold="geo"] .fold-sum')).to_have_text("Off")
    print("1. Rules folds closed except 'Who gets swept'; summaries shown")

    # pace presets
    page.locator(P + 'details[data-fold="speed"] summary').click()
    expect(page.locator(P + '.chip[data-pace="safe"]')).to_have_attribute("aria-pressed", "true")
    page.locator(P + '.chip[data-pace="balanced"]').click()
    nums = page.locator(P + "input[type=number]")
    assert [nums.nth(i).input_value() for i in range(4, 9)] == ["15", "30", "15", "2", "4"], [nums.nth(i).input_value() for i in range(4, 9)]
    expect(page.locator(P + '.chip[data-pace="balanced"]')).to_have_attribute("aria-pressed", "true")
    nums.nth(4).fill("16")
    expect(page.locator(P + '.chip[data-pace="balanced"]')).to_have_attribute("aria-pressed", "false")
    page.locator(P + '.chip[data-pace="safe"]').click()
    page.get_by_role("button", name="Save rules").click()
    print("2. Pace presets fill pauses and track manual edits")

    page.get_by_role("tab", name="Rules").click()
    expect(page.locator(P + 'details[data-fold="speed"]')).to_have_attribute("open", "")  # remembered
    page.locator(P + 'details[data-fold="health"] summary').click()
    before = len(calls())
    page.get_by_role("button", name="Run check").click()
    expect(page.locator(P + ".health-item").last).to_contain_text("SapuX version", timeout=15000)
    print("   ", list(zip(classes(), items())))
    assert classes()[:4] == ["ok", "ok", "ok", "warn"], classes()
    assert "Location request is outdated" in items()[3]
    new = calls()[before:]
    assert new and all(c["method"] == "GET" for c in new), new
    assert any(c["path"].endswith("friends/list.json") and c["query"]["count"] == ["1"] for c in new)
    expect(page.locator(P + ".status")).to_have_text("1 warnings. See the health check in Rules.")
    print("3. Health check: read-only, flags the stale location request")

    p2 = ctx.new_page(); p2.goto("https://x.com/raj/about"); p2.wait_for_timeout(1200); p2.close()
    page.get_by_role("button", name="Run check").click()
    expect(page.locator(P + ".status")).to_have_text("All checks passed.", timeout=15000)
    assert classes()[3] == "ok", list(zip(classes(), items()))
    page.wait_for_timeout(300); page.screenshot(path=str(HERE / "health.png"), clip={"x": 812, "y": 6, "width": 462, "height": 888})
    print("4. After X teaches the new request ID: all checks pass")
    bad = [e for e in errors if "Uncaught" in e or ".js" in e]; assert not bad, bad
    ctx.close()
print("HEALTH E2E PASSED")
