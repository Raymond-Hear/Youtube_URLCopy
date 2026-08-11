from pathlib import Path
import re

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_URL = (ROOT / "tests" / "ui-fixture.html").as_uri()
SCREENSHOT = ROOT / ".artifacts" / "phase-2-preview.png"
RUNTIME_SCREENSHOT = ROOT / ".artifacts" / "phase-2-runtime.png"
COLLAPSED_SCREENSHOT = ROOT / ".artifacts" / "phase-2-collapsed.png"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def watch_console_errors(page, errors) -> None:
    page.on(
        "console",
        lambda message: errors.append(message.text)
        if message.type == "error"
        else None,
    )


def check_static_fixture(browser, console_errors) -> None:
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    watch_console_errors(page, console_errors)

    page.goto(FIXTURE_URL)
    page.wait_for_load_state("networkidle")
    panel = page.locator("#yt-link-copy-panel")
    assert panel.is_visible()
    assert page.locator(".ytlc-batch-size option").all_text_contents() == [
        "10 条",
        "25 条",
        "50 条",
    ]
    page.locator(".ytlc-batch-size").select_option("25")
    assert page.locator(".ytlc-batch-size").input_value() == "25"

    page.goto(f"{FIXTURE_URL}?state=preview")
    page.wait_for_load_state("networkidle")
    preview = page.locator(".ytlc-preview")
    assert preview.is_visible()
    assert "\n\nhttps://www.youtube.com/watch?v=" in preview.text_content()
    assert page.locator(".ytlc-preview-toggle").get_attribute("aria-expanded") == "true"
    page.screenshot(path=str(SCREENSHOT), full_page=True)

    page.goto(f"{FIXTURE_URL}?state=collapsed")
    page.wait_for_load_state("networkidle")
    assert page.locator(".ytlc-body").is_hidden()
    assert page.locator(".ytlc-brand").is_visible()
    page.close()


def check_collector_runtime(browser, console_errors) -> None:
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    watch_console_errors(page, console_errors)
    page.add_init_script(
        script="""
        globalThis.__ytlcStorage = {
          youtubeLinkCopyUiStateV1: { collapsed: false, batchSize: 25 },
          youtubeLinkCopyPageStateV2: {
            sources: {
              "channel:/@localtest": {
                status: "copied",
                batchNumber: 1,
                deliveredIds: ["_GPSfzoVvC4", "_SpyH8wTA-4"],
                pendingBatch: null,
                lastBatch: {
                  batchId: "local-batch-1",
                  batchNumber: 1,
                  rangeStart: 1,
                  rangeEnd: 2,
                  videoIds: ["_GPSfzoVvC4", "_SpyH8wTA-4"],
                  urls: [
                    "https://www.youtube.com/watch?v=_GPSfzoVvC4",
                    "https://www.youtube.com/watch?v=_SpyH8wTA-4"
                  ],
                  exhausted: false
                },
                pagination: {
                  cursor: null,
                  queuedItems: [],
                  sourceExhausted: false
                },
                exhausted: false,
                progress: 0,
                error: null
              }
            }
          }
        };
        globalThis.chrome = {
          storage: {
            local: {
              async get(key) {
                return { [key]: globalThis.__ytlcStorage[key] };
              },
              async set(values) {
                Object.assign(globalThis.__ytlcStorage, values);
              }
            }
          },
          runtime: {
            onMessage: { addListener() {} }
          }
        };
        """
    )
    page.route(
        "**/*",
        lambda route: route.fulfill(
            status=200,
            content_type="text/html",
            body="<!doctype html><html><body><main>Local YouTube fixture</main></body></html>",
        ),
    )
    page.goto("https://www.youtube.com/@localtest", wait_until="domcontentloaded")
    page.add_style_tag(path=str(ROOT / "src" / "page-button.css"))
    page.add_script_tag(path=str(ROOT / "src" / "shared.js"))
    page.add_script_tag(path=str(ROOT / "src" / "youtube-data.js"))
    page.add_script_tag(path=str(ROOT / "src" / "collector.js"))
    page.locator("#yt-link-copy-panel:not([hidden])").wait_for()

    assert page.locator(".ytlc-batch-size").input_value() == "25"
    assert "3–27" in page.locator(".ytlc-button-text").text_content()

    export_button = page.locator(".ytlc-export")
    assert export_button.is_visible()
    assert export_button.text_content() == "导出已复制 2 条"
    with page.expect_download() as download_info:
        export_button.click()
    download = download_info.value
    assert re.match(
        r"^YouTube链接-@localtest-2条-\d{4}-\d{2}-\d{2}\.txt$",
        download.suggested_filename,
    )
    download_path = download.path()
    assert download_path is not None
    assert Path(download_path).read_bytes() == (
        b"https://www.youtube.com/watch?v=_GPSfzoVvC4\r\n\r\n"
        b"https://www.youtube.com/watch?v=_SpyH8wTA-4"
    )

    page.locator(".ytlc-preview-toggle").click()
    preview = page.locator(".ytlc-preview")
    assert preview.is_visible()
    assert "\r\n\r\n" in preview.evaluate("node => node.textContent")

    page.locator(".ytlc-batch-size").select_option("10")
    page.wait_for_function(
        "globalThis.__ytlcStorage.youtubeLinkCopyUiStateV1.batchSize === 10"
    )
    assert "3–12" in page.locator(".ytlc-button-text").text_content()
    page.screenshot(path=str(RUNTIME_SCREENSHOT), full_page=True)

    page.locator(".ytlc-brand").click()
    page.wait_for_function(
        "document.querySelector('#yt-link-copy-panel').dataset.collapsed === 'true'"
    )
    assert global_eval(page, "globalThis.__ytlcStorage.youtubeLinkCopyUiStateV1.collapsed")
    page.screenshot(path=str(COLLAPSED_SCREENSHOT), full_page=True)
    page.close()


def global_eval(page, expression):
    return page.evaluate(expression)


def main() -> None:
    SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
    console_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(EDGE),
            headless=True,
        )
        check_static_fixture(browser, console_errors)
        check_collector_runtime(browser, console_errors)
        browser.close()

    assert not console_errors, f"浏览器控制台错误：{console_errors}"
    print(
        "UI_CHECK=passed "
        f"static_screenshot={SCREENSHOT} runtime_screenshot={RUNTIME_SCREENSHOT} "
        f"collapsed_screenshot={COLLAPSED_SCREENSHOT}"
    )


if __name__ == "__main__":
    main()
