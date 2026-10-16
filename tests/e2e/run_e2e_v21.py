"""SapuX 2.1: one-way filter, quiet activity, backup/restore, queue resume, desktop notifications."""
import os, json, sys, shutil, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HERE = Path(sys.argv[1]); SRC = Path(sys.argv[2]); EXT = HERE / "ext21"
shutil.rmtree(EXT, ignore_errors=True)
shutil.copytree(SRC, EXT, ignore=shutil.ignore_patterns("tests", "*.md", ".git", ".github"))
p = EXT / "ui/panel.js"; p.write_text(p.read_text().replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'))
# Catat setiap notifikasi yang dibuat service worker.
b = EXT / "background.js"
b.write_text("""
const __create = chrome.notifications.create.bind(chrome.notifications);
chrome.notifications.create = async (id, opts) => {
  const r = await chrome.storage.local.get("__notifs");
  await chrome.storage.local.set({ __notifs: [...(r.__notifs || []), { id, title: opts.title, message: opts.message, icon: opts.iconUrl }] });
  return __create(id, opts).catch(() => id);
};
""" + b.read_text())

def calls():
    f = HERE / "calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
def destroyed(): return [x["body"]["user_id"][0] for x in calls() if x["path"].endswith("friendships/destroy.json")]

errors, dialogs = [], []
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(str(HERE / "profile21"), executable_path=os.environ.get("CHROMIUM") or None,
        headless=False, viewport={"width": 1280, "height": 900}, accept_downloads=True,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
              "--host-resolver-rules=MAP x.com:443 127.0.0.1:8444, MAP api.x.com:443 127.0.0.1:8444, MAP pbs.twimg.com:443 127.0.0.1:8444, MAP * ~NOTFOUND",
              "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    def on_dialog(d):
        dialogs.append(d.message); print(f"  [confirm] {d.message.splitlines()[0]!r}"); d.accept()
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
    def shot(name): page.wait_for_timeout(350); page.screenshot(path=str(HERE / f"v21-{name}.png"))
    def notifs():
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        return sw.evaluate("chrome.storage.local.get('__notifs').then(r => r.__notifs || [])")
    def save_rules(): page.get_by_role("button", name="Save rules").click(); expect(page.locator(P + ".status")).to_have_text("Rules saved. Selection rebuilt.")

    page.goto("https://x.com/home?dark"); page.wait_for_timeout(1500)
    page.locator(P + ".fab").click()
    page.get_by_role("button", name="Scan following").click()
    expect(page.locator(P + ".status")).to_have_text("Scan finished: 14 accounts.", timeout=20000)
    c = counts(); assert c == {"inactive": "12", "unknown": "0", "active": "1", "protected": "1"}, c
    print("1. First scan:", c)

    # --- 1. one-way filter ---
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name=re.compile("don't follow you back")).check()
    save_rules()
    c = counts(); assert c == {"inactive": "12", "oneway": "1", "unknown": "0", "active": "0", "protected": "1"}, c
    page.locator(P + '.seg[data-group="oneway"]').click()
    expect(page.locator(P + ".hint")).to_contain_text("Don't follow you back")
    expect(page.locator(P + ".item .name")).to_have_text(["Aktif5"])
    expect(page.locator(P + ".hero-count")).to_have_text("13")
    print("2. One-way group:", c)

    # --- 2. quiet activity: diam's following count changed between scans ---
    page.get_by_role("button", name="Rescan").click()
    expect(page.locator(P + ".status")).to_have_text("Scan finished: 14 accounts.", timeout=20000)
    # diam is active again (quietly) but still doesn't follow back, so it lands in One-way with the tag
    c = counts(); assert c["inactive"] == "11" and c["oneway"] == "2" and c["active"] == "0", c
    page.locator(P + '.seg[data-group="oneway"]').click()
    expect(page.locator(P + ".item", has_text="Diam").locator(".tag.quiet")).to_have_text("active quietly")
    shot("1-quiet")
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name="Detect quiet activity").uncheck(); save_rules()
    assert counts()["inactive"] == "12"
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.get_by_role("switch", name="Detect quiet activity").check(); save_rules()
    assert counts()["inactive"] == "11"
    print("3. Quiet activity detected after rescan; toggle works")

    # --- 3. backup export / import ---
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.locator(P + "textarea").fill("@teman\n@old05")
    save_rules()
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export backup").click()
    path = HERE / "backup.json"; dl.value.save_as(path)
    data = json.loads(path.read_text())
    assert data["app"] == "SapuX" and data["settings"]["unfollowNonFollowers"] is True and "@old05" in data["settings"]["whitelist"], data
    assert dl.value.suggested_filename.startswith("sapux-backup-")
    page.locator(P + "textarea").fill(""); page.get_by_role("switch", name=re.compile("don't follow you back")).uncheck(); save_rules()
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    bad = HERE / "bad.json"; bad.write_text('{"hello": 1}')
    page.locator(P + "input[type=file]").set_input_files(str(bad))
    expect(page.locator(P + ".status")).to_have_text("That file isn't a valid SapuX backup.")
    page.locator(P + "input[type=file]").set_input_files(str(path))
    expect(page.locator(P + ".status")).to_have_text("Backup restored.")
    expect(page.locator(P + "textarea")).to_have_value("@teman\n@old05")
    expect(page.get_by_role("switch", name=re.compile("don't follow you back"))).to_be_checked()
    shot("2-rules")
    c = counts(); assert c == {"inactive": "10", "oneway": "2", "unknown": "0", "active": "0", "protected": "2"}, c
    print("4. Backup export/import OK, invalid file rejected:", c)

    # --- 4. queue: live run stops at daily cap, rest is saved ---
    page.get_by_role("switch", name=re.compile("Simulation mode")).uncheck()
    nums = page.locator(P + "input[type=number]")
    nums.nth(3).fill("3"); nums.nth(4).fill("10"); nums.nth(5).fill("10")
    save_rules()
    page.get_by_role("tab", name="Review").click()
    page.get_by_role("button", name="Unfollow 3").click()
    d = page.locator(P + ".dialog")
    expect(d.locator(".dlg-title")).to_have_text("Unfollow 3 accounts?")
    # live mode: initial focus is Cancel, so a stray Enter can't start unfollowing
    focused = page.evaluate("document.querySelector('#sapux-host').shadowRoot.activeElement.textContent")
    assert focused == "Cancel", focused
    page.keyboard.press("Tab"); page.keyboard.press("Tab")  # focus stays trapped inside the dialog
    assert page.evaluate("document.querySelector('#sapux-host').shadowRoot.activeElement.closest('.dialog') !== null")
    page.keyboard.press("Escape")
    expect(d).to_have_count(0)
    expect(page.locator(P + ".panel")).to_be_visible()
    page.get_by_role("button", name="Unfollow 3").click()
    d.get_by_role("button", name="Cancel").click()
    expect(d).to_have_count(0)
    assert destroyed() == [], destroyed()
    print("4b. Dialog: Esc and Cancel abort, focus starts on Cancel and stays trapped")
    page.get_by_role("button", name="Unfollow 3").click()
    page.wait_for_timeout(400); page.screenshot(path=str(HERE / "v22-dialog-live.png"))
    accept_run("Live run")
    expect(page.locator(P + ".status")).to_contain_text("9 accounts saved to your queue.", timeout=90000)
    assert "To your queue\n9" in custom[-1] and "don't follow you back" not in custom[-1] and "Inactive\n3" in custom[-1], custom[-1]
    assert not dialogs, dialogs
    assert destroyed() == ["1", "110", "109"], destroyed()
    expect(page.locator(P + ".banner-title")).to_have_text("9 accounts left in your queue")
    print("5. Cap hit after 3, queue saved:", destroyed())

    n = notifs(); assert len(n) == 1 and n[0]["title"] == "SapuX reached its 24-hour limit" and "queue" in n[0]["message"] and n[0]["icon"].endswith("icon128.png"), n
    print("6. Desktop notification:", n[0]["title"], "|", n[0]["message"])

    # queue survives a reload
    page.reload(); page.wait_for_timeout(1500); page.locator(P + ".fab").click()
    expect(page.locator(P + ".banner-title")).to_have_text("9 accounts left in your queue")
    shot("3-queue")
    # resume after raising the cap: 2 more today
    page.get_by_role("tab", name="Rules").click(); open_folds(page)
    page.locator(P + "input[type=number]").nth(3).fill("5"); save_rules()
    page.get_by_role("tab", name="Review").click()
    page.get_by_role("button", name="Resume").click()
    accept_run("Resume queue")
    expect(page.locator(P + ".status")).to_contain_text("7 accounts saved to your queue.", timeout=90000)
    assert destroyed() == ["1", "110", "109", "108", "107"], destroyed()
    expect(page.locator(P + ".banner-title")).to_have_text("7 accounts left in your queue")
    print("7. Resume continued in queue order:", destroyed()[3:])

    # resume with no daily allowance left = blocked, queue untouched
    page.get_by_role("button", name="Resume").click()
    expect(page.locator(P + ".status")).to_contain_text("per 24 hours is used up. Next slot opens")
    expect(page.locator(P + ".mode.live")).to_contain_text("Limit full until")
    expect(page.locator(P + ".banner-body")).to_contain_text("You can resume once a slot opens")
    print("8a. Limit full: next slot time shown in footer and queue card")

    # rolling 24 h window: the counter is per timestamp, not per calendar day
    sw = ctx.service_workers[0]
    key = sw.evaluate("chrome.storage.local.get(null).then(r => Object.keys(r).find(k => k.startsWith('daily:')))")
    stamps = sw.evaluate(f"chrome.storage.local.get('{key}').then(r => r['{key}'])")
    assert stamps["v"] == 2 and len(stamps["stamps"]) == 5, stamps
    # an old per-date counter ({date, count}) is rebuilt from History: 5 real unfollows, not 99
    sw.evaluate(f"chrome.storage.local.set({{ '{key}': {{ date: '2026-01-01', count: 99 }} }})")
    expect(page.locator(P + ".mode.live")).to_contain_text("Limit full until")
    # the two oldest unfollows are about to leave the 24 h window; the panel picks that up by itself
    sw.evaluate(f"""(() => {{ const now = Date.now(), day = 864e5;
      return chrome.storage.local.set({{ '{key}': {{ v: 2, stamps: [now - day + 5000, now - day + 6000, now - 3e5, now - 2e5, now - 1e5] }} }}); }})()""")
    expect(page.locator(P + ".mode.live")).to_have_text("Live mode, 2/5 left (24 h)", timeout=45000)
    expect(page.locator(P + ".banner-body")).to_contain_text("Resume to continue")
    print("8b. Old counter migrated from history; slots reopen 24 h after each unfollow")
    page.get_by_role("button", name="Discard").click()
    expect(page.locator(P + ".status")).to_have_text("Queue discarded.")
    expect(page.locator(P + ".banner")).to_have_count(0)
    print("8. Discard OK")

    # Indonesian strings for the new bits
    page.get_by_role("button", name="ID", exact=True).click()
    page.get_by_role("tab", name="Aturan").click(); open_folds(page)
    expect(page.get_by_role("switch", name="Deteksi aktivitas diam-diam")).to_be_visible()
    expect(page.get_by_role("button", name="Export backup")).to_be_visible()
    page.get_by_role("tab", name="Daftar").click()
    expect(page.locator(P + '.seg[data-group="oneway"] .seg-label')).to_have_text("Sepihak")
    page.get_by_role("button", name="EN", exact=True).click()
    print("9. Indonesian labels OK")

    hosts = {x["host"] for x in calls()}; assert hosts == {"x.com"}, hosts
    bad = [e for e in errors if "sapux" in e.lower() or "panel.js" in e or "Uncaught" in e]; assert not bad, bad
    ctx.close()
print("\nE2E V2.1 PASSED")
