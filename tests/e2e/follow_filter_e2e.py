import os, sys, shutil, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "extff"
shutil.rmtree(EXT, ignore_errors=True); shutil.rmtree(HERE / "profileff", ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "docs", "*.md", ".git*"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))
errors = []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profileff"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900},
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8443", "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    P = "#sapux-host >> "
    def open_folds(pg):
        pg.evaluate("document.querySelector('#sapux-host').shadowRoot.querySelectorAll('details.fold').forEach(d => d.open = true)")
    def chips(): return [re.sub(r"\s", "", c) for c in page.locator(P + ".chip").all_inner_texts()]
    page.goto("https://x.com/home?dark"); page.wait_for_timeout(1500)
    page.locator(P + ".fab").click()
    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_contain_text("Scan finished", timeout=20000)
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name="Keep accounts that follow you back").uncheck()
    page.get_by_role("button", name="Save rules").click()
    page.locator(P + '.seg[data-group="inactive"]').click()
    assert chips() == ["All6", "Followsyou1", "Doesn'tfollow5"], chips()
    expect(page.locator(P + ".hero-count")).to_have_text("6")
    print("1. Chips with counts:", chips())

    page.get_by_role("button", name=re.compile("^Follows you")).click()
    expect(page.locator(P + ".item .name")).to_have_text(["Mutual500"])
    expect(page.locator(P + ".toolbar .num")).to_have_text("1 found, 1 selected")
    page.locator(P + ".toolbar").get_by_role("button", name="Clear").click()
    expect(page.locator(P + ".hero-count")).to_have_text("5")
    page.wait_for_timeout(300); page.screenshot(path=str(HERE / "ff-follows.png"))
    print("2. 'Follows you' shows only mutuals; Clear only affected them")

    page.get_by_role("button", name=re.compile("^Doesn't follow")).click()
    expect(page.locator(P + ".item")).to_have_count(5)
    page.locator(P + ".search input").fill("lama")
    expect(page.locator(P + ".item")).to_have_count(2)
    assert chips() == ["All2", "Followsyou0", "Doesn'tfollow2"], chips()
    page.get_by_role("button", name=re.compile("^Follows you")).click()
    expect(page.locator(P + ".list")).to_have_count(0)
    page.locator(P + ".search input").fill("")
    page.get_by_role("button", name=re.compile("^Follows you")).click()
    expect(page.locator(P + ".empty p")).to_have_count(0)
    page.get_by_role("button", name=re.compile("^All")).click()
    expect(page.locator(P + ".item")).to_have_count(6)
    print("3. Combines with search; counts follow the search; All restores")

    page.get_by_role("button", name=re.compile("^Doesn't follow")).click()
    page.get_by_role("button", name="ID", exact=True).click()
    assert chips() == ["Semua6", "Followbalik1", "Tidakfollowbalik5"], chips()
    page.wait_for_timeout(300); page.screenshot(path=str(HERE / "ff-id.png"))
    page.get_by_role("button", name="EN", exact=True).click()
    print("4. Indonesian labels:", chips())
    bad = [e for e in errors if "Uncaught" in e or "panel.js" in e]; assert not bad, bad
    ctx.close()
print("FOLLOW FILTER E2E PASSED")
