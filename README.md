# Sky Geometry

A local astronomy workbench at [CoolCode](https://coolcode.ca/skygeometry/).
Convert equatorial/horizontal coordinates, inspect a 24-hour altitude curve,
measure angular separations and batch-convert target lists. No API key or data
collector is required.

<!-- coolcode:guide -->
Choose your location, observation time and coordinate system before converting RA/Dec to altitude/azimuth. Catalogue coordinates usually use J2000; select equator of date only when your input already uses that frame. A positive altitude clears a level horizon, not nearby trees, buildings or cloud.
<!-- /coolcode:guide -->

## What it calculates

- **RA/Dec → Alt/Az and back:** decimal or sexagesimal input; RA explicitly in hours
  or degrees; azimuth clockwise from north (east 90°, south 180°, west 270°).
- **J2000 versus of date:** Astronomy Engine rotates J2000 coordinates for precession
  and nutation. Of-date inputs use the true equator at the specified time.
- **Observation time:** UTC or an IANA time zone. Spring-forward nonexistent times
  are rejected. Repeated fall-back times have explicit first/second choices.
  Dates 1600–2200 are accepted. Time-zone rules come from the browser's IANA database;
  update the browser when civil-time rules change. UTC avoids that dependency.
- **Local apparent sidereal time, hour angle, next upper meridian transit.** Transit
  is not uniquely meaningful at a celestial or geographic pole.
- **24-hour altitude curve:** 10-minute default samples, approximate standard
  refraction optional, daylight/twilight/astronomical-night shading from the Sun's
  geometric altitude. Horizon-crossing times refine sampled sign changes; extremely
  brief grazing crossings between samples can be missed. All-sample labels say so.
- **Angular separation:** two directions in the same selected equatorial system.
- **CSV:** `name,ra,dec` columns, quoted fields, per-row errors, 2,000-row/1 MiB limits,
  downloadable results and a separate altitude-curve export. The visible batch preview
  shows the first 100 rows; the download includes all rows. User-supplied text cells
  beginning with spreadsheet formula characters are prefixed with an apostrophe.

These are **fixed-direction** calculations. Proper motion, parallax, annual aberration,
moving-object ephemerides, terrain/obstructions, weather and light pollution are not
applied. Do not use static star presets to predict a moving Solar System body. The
refraction option uses an approximate standard atmosphere and is least reliable close
to the horizon. Numerical digits aid comparison, not a claim of measured accuracy.

For example, M31 is a useful starter from Langley: its declination makes it close to
circumpolar there. The Orion Nebula gives a clearer rise/set example. Check the actual
selected date, timezone and frame printed above every result.

## Privacy

All target coordinates and CSVs stay in tab memory. Location permission is optional.
Coordinates are saved only after **Remember location**; **Forget saved location**
removes `coolcode:skygeometry:location`. No targets or lists are retained. Geolocation
is provided by the browser/device; this app does not send the result to a server.
The shared CoolCode counter receives aggregate page opens, not observing inputs.

## Expand or customize

Edit `web/config.mjs`:

- Add any number of `locations` with `name`, `latitude`, `longitude`, `timeZone`.
- Add targets with `name`, `ra`, `dec`, `epoch` (`J2000` or `ofdate`). The bundled
  fixed J2000 directions are convenient approximate reference points, not a current
  astrometric catalogue. Use your own catalogue's correct epoch and position.
- Set `plotStepMinutes` between 1 and 60 (10 by default). Smaller intervals produce
  denser plots and more CPU work. `maxCsvRows`/`maxCsvBytes` bound batch processing.

Example additional preset:

```js
{name:'Sydney, Australia',latitude:-33.8688,longitude:151.2093,timeZone:'Australia/Sydney'}
```

Visitors can always enter other valid coordinates and locations. Tests exercise an
extra location and target beyond the bundled starter configuration. Push a reviewed
configuration/source change after normal checks; there is no remote-data refresh.

## Develop and publish

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

Python 3.12+ and Node 24+; build and runtime require no network/package install.
`dist/` is generated and ignored. Pages source should be **GitHub Actions**. The
workflow checks units/build and runs browser smoke tests in CI before deploying
successful `main` builds; PRs do not deploy. Assets are relative to the project path.

The tests include a published Meeus spherical-astronomy example, known pole/zenith
geometry, both-frame/refraction round trips, transit residuals, DST gaps/folds,
invalid coordinates and CSV injection protection.

`tool.json` supplies the reviewed catalogue record. Shared hub/Worker/sitemap/watchdog
registration is separate from this repository. No data collection schedule, collector
secret or freshness timestamp is required.

## Astronomy Engine and licence

Vendored unmodified ESM source from **Astronomy Engine v2.1.19**:
`https://raw.githubusercontent.com/cosinekitty/astronomy/v2.1.19/source/js/esm/astronomy.js`.
`web/vendor/astronomy.mjs` is the same source with an `.mjs` filename; the original MIT
licence is in `web/vendor/astronomy-LICENSE.txt`. See
[upstream documentation](https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/README.md).
Vendoring makes normal builds offline and reproducible. Review and re-run numerical
tests before updating the vendored version. No code is copied from astronomy.tools.
Application code is MIT; see `LICENSE`.
