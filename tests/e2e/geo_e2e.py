import os, sys, shutil, re, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "extgeo"
shutil.rmtree(EXT, ignore_errors=True); shutil.rmtree(HERE / "profilegeo", ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "docs", "*.md", ".git*"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))
def calls():
    f = HERE / "calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
def destroyed(): return [x["body"]["user_id"][0] for x in calls() if x["path"].endswith("friendships/destroy.json")]
errors = []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profilegeo"), executable_path=os.environ.get("CHROMIUM") or None,
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
    c = counts(); assert c == {"inactive": "8", "unknown": "0", "active": "1", "protected": "1"}, c
    expect(page.locator(P + ".item", has_text="Raj").locator(".tag.geo")).to_have_text("🇮🇳 India")
    expect(page.locator(P + ".item", has_text="Raj").locator(".tag.geo")).to_have_attribute("title", re.compile(r"Guess \(high confidence\): .*Mumbai.*flag 🇮🇳 in location|Guess \(high confidence\): flag 🇮🇳 in location.*mumbai", re.I))
    expect(page.locator(P + ".item", has_text="Sari").locator(".tag.geo.low")).to_have_count(1)
    expect(page.locator(P + ".item", has_text="Priya").locator(".tag.geo")).to_have_text("🇮🇳 India")
    expect(page.locator(P + ".item", has_text="Sari").locator(".tag.geo")).to_have_attribute("title", "Guess (low confidence): last post in Indonesian")
    expect(page.locator(P + ".item", has_text="Web3_anon").locator(".tag.geo")).to_have_count(0)
    print("1. Location tags from bio text, flag and post language")

    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    expect(page.locator(P + "p.geo-note")).to_have_text("Location found for 9 of 10 accounts.")
    keep = page.get_by_role("group", name="Keep accounts from"); focus = page.get_by_role("group", name="Unfollow these first")
    keep.get_by_role("button", name=re.compile("Indonesia")).click()
    keep.get_by_role("button", name="Southeast Asia").click()
    keep.get_by_role("button", name=re.compile("India$")).click()
    focus.get_by_role("button", name=re.compile("India$")).click()   # moving India from keep -> focus
    expect(keep.get_by_role("button", name=re.compile("India$"))).to_have_attribute("aria-pressed", "false")
    expect(focus.get_by_role("button", name=re.compile("India$"))).to_have_attribute("aria-pressed", "true")
    shot("geo-rules")
    save()
    c = counts(); assert c == {"inactive": "5", "unknown": "0", "active": "1", "protected": "4"}, c
    print("2. Keep Indonesia + Southeast Asia:", c)
    page.locator(P + '.seg[data-group="inactive"]').click()
    expect(page.locator(P + ".item", has_text="Raj").locator(".tag.geo")).to_have_count(1)
    expect(page.locator(P + ".item .tag.geo.focus")).to_have_count(0)
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    expect(page.get_by_role("switch", name=re.compile("Only use X's official data"))).to_be_checked()
    expect(page.locator(P + ".geo-note.warn")).to_have_text("Priority uses X's data only, so check candidates with X first.")
    page.get_by_role("switch", name=re.compile("Only use X's official data")).uncheck(); save()
    print("2b. Default: bio/language guesses never prioritize; switch off to allow")

    page.locator(P + '.seg[data-group="inactive"]').click()
    names = page.locator(P + ".item .name").all_inner_texts(); print("   inactive:", names)
    expect(page.locator(P + ".item", has_text="Raj").locator(".tag.geo.focus")).to_have_count(1)
    page.locator(P + ".search input").fill("india")
    expect(page.locator(P + ".item")).to_have_count(3)
    page.locator(P + ".search input").fill("")
    page.locator(P + '.seg[data-group="protected"]').click()
    expect(page.locator(P + ".item", has_text="Budi_jkt").locator(".tag.geo.keep")).to_have_text("🇮🇩 Indonesia")
    expect(page.locator(P + ".hint")).to_contain_text("Also accounts from places you keep.")
    shot("geo-kept")
    print("3. Focus tag, search by country, kept tag")

    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name="Only pre-select candidates from these places").check(); save()
    expect(page.locator(P + ".hero-count")).to_have_text("3")
    page.get_by_role("switch", name="Only pre-select candidates from these places").uncheck()
    page.get_by_role("switch", name=re.compile("Simulation mode")).uncheck()
    nums = page.locator(P + "input[type=number]"); nums.nth(3).fill("3"); nums.nth(4).fill("10"); nums.nth(5).fill("10")
    save()
    expect(page.locator(P + ".hero-count")).to_have_text("5")
    page.get_by_role("tab", name="Review").click()
    page.get_by_role("button", name="Unfollow 3").click()
    d = page.locator(P + ".dialog")
    expect(d).to_contain_text("3 of them are from your priority places and go first.")
    shot("geo-dialog")
    d.locator(".dlg-actions .btn").last.click()
    expect(page.locator(P + ".status")).to_contain_text("saved to your queue", timeout=90000)
    assert destroyed() == ["3", "4", "5"], destroyed()
    print("4. focusOnly pre-selects 3; live run unfollowed India first:", destroyed())

    page.get_by_role("button", name="ID", exact=True).click()
    page.get_by_role("tab", name="Aturan").click(); open_folds(page)
    expect(page.get_by_role("group", name="Lindungi akun dari").get_by_role("button", name="Asia Tenggara")).to_have_attribute("aria-pressed", "true")
    page.get_by_role("button", name="EN", exact=True).click()
    print("5. Indonesian labels OK")
    bad = [e for e in errors if "Uncaught" in e or "panel.js" in e]; assert not bad, bad
    ctx.close()
print("GEO E2E PASSED")
