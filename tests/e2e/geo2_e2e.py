import os, sys, shutil, re, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "extgeo2"
shutil.rmtree(EXT, ignore_errors=True); shutil.rmtree(HERE / "profilegeo2", ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "docs", "*.md", ".git*"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))
def calls():
    f = HERE / "calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
errors = []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profilegeo2"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900},
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8446, MAP api.x.com:443 127.0.0.1:8446, MAP pbs.twimg.com:443 127.0.0.1:8446, MAP * ~NOTFOUND", "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    P = "#sapux-host >> "
    def open_folds(pg):
        pg.evaluate("document.querySelector('#sapux-host').shadowRoot.querySelectorAll('details.fold').forEach(d => d.open = true)")
    def counts(): return {s.get_attribute("data-group"): s.locator(".seg-count").inner_text() for s in page.locator(P + ".seg").all()}
    def save(): page.get_by_role("button", name="Save rules").click(); expect(page.locator(P + ".status")).to_have_text("Rules saved. Selection rebuilt.")
    def shot(name): page.wait_for_timeout(400); page.screenshot(path=str(HERE / f"{name}.png"), clip={"x": 812, "y": 6, "width": 462, "height": 888})
    page.goto("https://x.com/home?dark"); page.wait_for_timeout(1500)
    page.locator(P + ".fab").click()
    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_contain_text("Scan finished: 10", timeout=20000)
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("group", name="Keep accounts from").get_by_role("button", name=re.compile("Indonesia")).click()
    page.get_by_role("group", name="Keep accounts from").get_by_role("button", name="Southeast Asia").click()
    page.get_by_role("group", name="Unfollow these first").get_by_role("button", name=re.compile("India$")).click()
    save()
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    btn = page.get_by_role("button", name="Check 8 with X")
    expect(btn).to_be_visible()

    # 1. the built-in query ID is "stale" on this fake server -> clear message, nothing saved
    btn.click()
    expect(page.locator(P + ".status")).to_contain_text("X changed this request", timeout=15000)
    print("1. Stale query ID -> clear instruction")

    # 2. opening an About page in X teaches SapuX the new query ID
    page2 = ctx.new_page(); page2.goto("https://x.com/raj/about"); page2.wait_for_timeout(1500); page2.close()
    sw = ctx.service_workers[0]
    stored = sw.evaluate("chrome.storage.local.get('gql:AboutAccountQuery')")
    assert stored["gql:AboutAccountQuery"]["id"] == "NewAboutId_1234", stored
    print("2. Captured new query ID from X's own request")

    page.get_by_role("button", name="Check 8 with X").click()
    expect(page.get_by_role("button", name="Stop checking")).to_be_visible()
    page.wait_for_timeout(1500); shot("geo2-running")
    expect(page.locator(P + ".status")).to_have_text("Location checked for 8 accounts.", timeout=60000)
    expect(page.locator(P + ".field .geo-note")).to_have_text("All 8 candidates are checked with X.")
    about = [c for c in calls() if c["path"].endswith("/AboutAccountQuery") and "NewAboutId" in c["path"]]
    handles = [json.loads(c["query"]["variables"][0])["screenName"] for c in about]
    assert "mutual_id" not in handles and "active_in" not in handles, handles
    assert all(c["auth"] == "Bearer TESTBEARER" and c["csrf"] == "CSRF123" for c in about)
    print("3. Checked 8 candidates only:", handles)
    page.get_by_role("tab", name="Review").click(); page.get_by_role("tab", name="Rules").click(); open_folds(page)
    expect(page.locator(P + "p.geo-note.accuracy")).to_have_text("Guesses vs X data: 83% match on 6 accounts (high 100% · medium 75% · low 100%).")
    page.locator(P + "p.geo-note.accuracy").scroll_into_view_if_needed(); shot("geo3-accuracy")
    print("3b. Accuracy of guesses measured against X data")

    page.get_by_role("tab", name="Review").click()
    page.locator(P + '.seg[data-group="inactive"]').click()
    nyc = page.locator(P + ".item", has_text="Nyc_Trader").locator(".tag.geo")
    expect(nyc).to_have_text("🇮🇳 India"); expect(nyc).to_have_attribute("title", "X says: account based in India")
    expect(nyc).to_have_class(re.compile("official")); expect(nyc).to_have_class(re.compile("focus"))
    priya = page.locator(P + ".item", has_text="Priya").locator(".tag.geo")
    expect(priya).to_have_text("South Asia"); expect(priya).not_to_have_class(re.compile("focus"))
    dev = page.locator(P + ".item", has_text="Dev_Hindi").locator(".tag.geo")
    expect(dev).to_have_attribute("title", re.compile("VPN")); expect(dev).not_to_have_class(re.compile("focus"))
    expect(page.locator(P + ".item", has_text="Web3_anon").locator(".tag.geo")).to_have_text("🇳🇬 Nigeria")
    shot("geo2-review")
    print("4. Official data overrides guesses; VPN-flagged not used as priority")

    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name="Only pre-select candidates from these places").check(); save()
    expect(page.locator(P + ".hero-count")).to_have_text("2")  # raj + nyc_trader
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    expect(page.get_by_role("button", name="Check 0 with X")).to_be_disabled()
    page.reload(); page.wait_for_timeout(1500); page.locator(P + ".fab").click()
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    expect(page.locator(P + ".field .geo-note")).to_have_text("All 8 candidates are checked with X.")
    print("5. focusOnly uses official data; results persist after reload")
    bad = [e for e in errors if "Uncaught" in e or "panel.js" in e]; assert not bad, bad
    ctx.close()
print("GEO2 E2E PASSED")
