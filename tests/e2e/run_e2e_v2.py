"""Uji SapuX v2 di Chromium sungguhan terhadap server x.com tiruan (English default, switch ke Indonesia, tema gelap & terang)."""
import os, json, sys, shutil, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "ext"
shutil.rmtree(EXT, ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "*.md"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))

def calls():
    f = HERE / "calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []

dialogs, errors = [], []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profile"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900},
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8443, MAP api.x.com:443 127.0.0.1:8443, MAP pbs.twimg.com:443 127.0.0.1:8443, MAP * ~NOTFOUND",
              "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_NAME_NOT_RESOLVED" not in m.text and "404" not in m.text else None)
    def on_dialog(d):
        dialogs.append((d.type, d.message)); print(f"  [dialog:{d.type}] {d.message.splitlines()[0]!r}"); d.accept()
    page.on("dialog", on_dialog)
    custom = []
    def accept_run(expect_eyebrow=None):
        d = page.locator(P + ".dialog")
        expect(d).to_be_visible()
        if expect_eyebrow: expect(d.locator(".dlg-eyebrow")).to_have_text(expect_eyebrow, ignore_case=True)
        txt = d.inner_text(); custom.append(txt); print("  [sapux dialog]", txt.splitlines()[1] if len(txt.splitlines()) > 1 else txt)
        d.locator(".dlg-actions .btn").last.click()
        expect(d).to_have_count(0)
        return txt
    P = "#sapux-host >> "
    def open_folds(pg):
        pg.evaluate("document.querySelector('#sapux-host').shadowRoot.querySelectorAll('details.fold').forEach(d => d.open = true)")
    def counts(): return {s.get_attribute("data-group"): s.locator(".seg-count").inner_text() for s in page.locator(P + ".seg").all()}
    def shot(name): page.wait_for_timeout(350); page.screenshot(path=str(HERE / f"v2-{name}.png"))

    page.goto("https://x.com/home?dark"); page.wait_for_timeout(1500)
    fab = page.locator(P + ".fab")
    expect(fab).to_have_text("SapuX", timeout=10000)
    shot("0-fab")
    fab.click()
    expect(page.locator(P + ".head")).to_contain_text("@timotest")
    assert page.locator(P + ".root").get_attribute("data-theme") == "dark"
    expect(page.locator(P + ".empty-title")).to_have_text("Scan the accounts you follow")
    shot("1-empty")
    print("1. Panel opens in English, dark theme follows X")

    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_have_text("Scan finished: 8 accounts.", timeout=20000)
    c = counts(); assert c == {"inactive": "5", "unknown": "1", "active": "1", "protected": "1"}, c
    expect(page.locator(P + ".hero-count")).to_have_text("5")
    names = page.locator(P + ".item .name").all_inner_texts()
    assert names[0] == "Vipacct" and "<img src=x onerror=alert(1)>" in names, names
    page.locator(P + ".item").first.hover()
    shot("2-list")
    print("2. Scan:", c)

    page.locator(P + ".search input").fill("lama4")
    expect(page.locator(P + ".item")).to_have_count(1)
    page.locator(P + ".item", has_text="Lama400").get_by_role("button", name="Keep").click()
    expect(page.locator(P + ".status")).to_have_text("@lama400 is now on your keep list.")
    c = counts(); assert c["inactive"] == "4" and c["protected"] == "2", c
    page.locator(P + '.seg[data-group="protected"]').click()
    page.locator(P + ".item", has_text="Lama400").get_by_role("button", name="Release").click()
    c = counts(); assert c["inactive"] == "5" and c["protected"] == "1", c
    page.locator(P + ".search input").fill("")
    page.locator(P + '.seg[data-group="inactive"]').click()
    expect(page.locator(P + ".hero-count")).to_have_text("5")
    # klik baris = toggle pilihan
    page.locator(P + ".item", has_text="Lama200").locator(".name").click()
    expect(page.locator(P + ".hero-count")).to_have_text("4")
    page.locator(P + ".item", has_text="Lama200").locator(".name").click()
    expect(page.locator(P + ".hero-count")).to_have_text("5")
    print("3. Search, Keep, Release, row-click toggle OK")

    page.get_by_role("button", name="Simulate 5").click()
    accept_run("Simulation")
    expect(page.locator(P + ".status")).to_have_text("Done: 5 accounts simulated.", timeout=15000)
    assert not [x for x in calls() if "friendships" in x["path"]]
    print("4. Simulation sent no unfollow requests")

    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.locator(P + "textarea").fill("@vipacct\nhttps://x.com/evil")
    page.get_by_role("switch", name=re.compile("Simulation mode")).uncheck()
    nums = page.locator(P + "input[type=number]")
    nums.nth(4).fill("10"); nums.nth(5).fill("10")
    page.get_by_role("button", name="50K", exact=True).click(); assert nums.nth(1).input_value() == "50000"
    page.get_by_role("button", name="50", exact=True).click(); assert nums.nth(2).input_value() == "50"
    shot("3-rules")
    page.get_by_role("button", name="Save rules").click()
    expect(page.locator(P + ".status")).to_have_text("Rules saved. Selection rebuilt.")
    c = counts(); assert c == {"inactive": "2", "small": "2", "unknown": "0", "active": "0", "protected": "4"}, c
    print("5. Rules saved:", c)

    page.locator(P + '.seg[data-group="small"]').click()
    expect(page.locator(P + ".hint")).to_contain_text("Fewer than 50 followers")
    shot("4-small")
    page.locator(P + '.seg[data-group="inactive"]').click()
    expect(page.locator(P + ".mode.live")).to_have_text("Live mode, 80/80 left today")
    page.get_by_role("button", name="Unfollow 4").click()
    accept_run("Live run")
    page.wait_for_timeout(1200); shot("5-running")
    # Pindah ke History SELAMA proses berjalan: daftar harus ikut bertambah tanpa pindah tab lagi.
    page.get_by_role("tab", name="History").click()
    expect(page.locator(P + ".status")).to_have_text("Done: 4 accounts unfollowed.", timeout=90000)
    expect(page.locator(P + ".body")).to_contain_text("4 live unfollows, 5 simulated")
    print("6a. History updated live while unfollow ran (no tab switch)")
    page.get_by_role("tab", name="Review").click()
    ids = [x["body"]["user_id"][0] for x in calls() if x["path"].endswith("friendships/destroy.json")]
    assert ids == ["1", "5", "2", "3"], ids
    expect(page.locator(P + ".mode.live")).to_contain_text("76/80")
    print("6. Live unfollow:", ids)

    page.get_by_role("tab", name="History").click()
    expect(page.locator(P + ".body")).to_contain_text("4 live unfollows, 5 simulated")
    page.get_by_role("button", name="Follow again").first.click()
    expect(page.locator(P + ".status")).to_have_text("Followed @kosong again.")
    shot("6-history")
    print("7. Follow again OK")

    page.get_by_role("button", name="Refresh view").click()
    expect(page.locator(P + ".status")).to_have_text("View is up to date.")
    expect(page.locator(P + ".body")).to_contain_text("3 live unfollows, 5 simulated")
    print("7a. Refresh button OK")

    # Tab X kedua mengubah data: panel di tab pertama harus ikut berubah sendiri.
    page2 = ctx.new_page(); page2.goto("https://x.com/home?dark"); page2.wait_for_timeout(1200)
    page2.locator(P + ".fab").click()
    page2.get_by_role("tab", name="History").click()
    page2.get_by_role("button", name="Clear simulations").click()
    expect(page.locator(P + ".body")).to_contain_text("3 live unfollows, 0 simulated", timeout=5000)
    page2.close()
    print("7b. Change made in another X tab appeared without switching tabs")

    page.get_by_role("button", name="ID", exact=True).click()
    expect(page.get_by_role("tab", name="Riwayat")).to_have_attribute("aria-selected", "true")
    expect(page.locator(P + ".body")).to_contain_text("3 unfollow asli, 0 simulasi")
    page.get_by_role("tab", name="Daftar").click()
    expect(page.locator(P + ".mode.live")).to_contain_text("Mode asli, sisa jatah 76/80")
    shot("7-id-dark")
    print("8. Switched to Indonesian")

    page.goto("https://x.com/home"); page.wait_for_timeout(1500)
    expect(page.locator(P + ".fab")).to_have_text("SapuX")
    page.locator(P + ".fab").click()
    assert page.locator(P + ".root").get_attribute("data-theme") == "light"
    expect(page.get_by_role("tab", name="Daftar")).to_be_visible()
    shot("8-id-light")
    page.get_by_role("button", name="EN", exact=True).click()
    expect(page.get_by_role("tab", name="Review")).to_be_visible()
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    shot("9-en-light-rules")
    page.get_by_role("tab", name="Review").click()
    shot("10-en-light")
    print("9. Language persisted after reload; light theme follows X")

    page.keyboard.press("Escape")
    expect(page.locator(P + ".panel")).to_be_hidden()
    hosts = {x["host"] for x in calls()}; assert hosts == {"x.com"}, hosts
    assert not dialogs, dialogs  # no native browser dialogs at all
    bad = [e for e in errors if "sapux" in e.lower() or "panel.js" in e or "Uncaught" in e]
    assert not bad, bad
    ctx.close()
print("\nE2E V2 PASSED")
