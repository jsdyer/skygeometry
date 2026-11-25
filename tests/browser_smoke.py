"""Exercise Sky Geometry at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                page.wait_for_function("document.querySelector('#result1').textContent !== '—'")
                page.locator("#zone").fill("UTC")
                page.locator("#zone").press("Tab")
                page.locator("#date").fill("1987-04-10T19:21")
                page.locator("#latitude").fill("38.921389")
                page.locator("#longitude").fill("-77.065556")
                page.locator("#epoch").select_option("ofdate")
                page.locator("#coord1").fill("23:09:16.641")
                page.locator("#coord2").fill("-06:43:11.61")
                page.locator("#calculate-form button[type=submit]").click()
                assert abs(float(page.locator("#result1").inner_text().rstrip("°")) - 15.1249) < 0.01
                assert abs(float(page.locator("#result2").inner_text().rstrip("°")) - 248.0337) < 0.01
                assert page.locator("#chart svg").count() == 1
                assert page.locator("#curve-table tr").count() >= 24
                page.locator("#direction").select_option("reverse")
                page.locator("#calculate-form button[type=submit]").click()
                assert page.locator("#result1").inner_text().startswith("23:09:16.64")
                page.locator("#ra2").fill("23:09:16.641")
                page.locator("#dec2").fill("-06:43:11.61")
                page.locator("#separation-form button").click()
                assert "0.00000°" in page.locator("#separation-result").inner_text()
                page.locator("#csv").fill('name,ra,dec\n"<img src=x>",1,-2\nBad,no,2')
                page.locator("#csv-convert").click()
                assert "1 converted, 1 errors" in page.locator("#csv-status").inner_text()
                assert page.locator("#csv-results tr").count() == 2
                assert page.locator("img").count() == 0
                with page.expect_download() as downloaded:
                    page.locator("#csv-download").click()
                assert downloaded.value.suggested_filename == "skygeometry-targets.csv"
                page.locator("#remember").click()
                assert page.locator("#forget").is_visible()
                page.reload()
                page.wait_for_function("document.querySelector('#result1').textContent !== '—'")
                assert page.locator("#latitude").input_value() == "38.921389"
                assert page.locator("#csv").input_value() == ""
                page.locator("#forget").click()
                assert page.evaluate("localStorage.getItem('coolcode:skygeometry:location')") is None
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: known coordinates, reverse transform, curve, CSV, opt-in storage and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
