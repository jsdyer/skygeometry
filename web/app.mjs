import { config } from "./config.mjs";
import {
  parseAngle,
  sexagesimal,
  validateObserver,
  equatorialToHorizontal,
  horizontalToEquatorial,
  angularSeparation,
  nextTransit,
  visibility,
  horizonCrossings,
  parseWallTime,
  wallTime,
  convertCsv,
  csvExport,
} from "./model.mjs";
const $ = (id) => document.getElementById(id),
  key = "coolcode:skygeometry:location";
let current = null,
  points = [],
  batch = [],
  oldZone = "UTC",
  oldUnits = "hours";
function element(tag, text) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}
function message(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
const fmt = (date, options = {}) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: current?.timeZone || $("zone").value,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(date));
const precise = (n) => `${n.toFixed(3)}°`;
const compass = (az) =>
  [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(az / 22.5) % 16];
function zoneChange(next) {
  let instant;
  try {
    instant = parseWallTime($("date").value, oldZone, $("fold").value).date;
  } catch {
    instant = new Date();
  }
  $("zone").value = next;
  try {
    $("date").value = wallTime(instant, next);
    oldZone = next;
  } catch {
    message("Enter a valid IANA time zone.", true);
  }
}
function location(index) {
  const p = config.locations[index];
  if (!p) return;
  $("latitude").value = p.latitude;
  $("longitude").value = p.longitude;
  zoneChange(p.timeZone);
}
function setTarget(index) {
  const p = config.targets[index];
  if (!p) return;
  $("coord1").value = p.ra;
  $("coord2").value = p.dec;
  $("ra-unit").value = "hours";
  oldUnits = "hours";
  $("epoch").value = p.epoch;
}
function collect() {
  const latitude = Number($("latitude").value),
    longitude = Number($("longitude").value);
  if (!$("latitude").value || !$("longitude").value)
    throw new Error("Enter latitude and longitude.");
  validateObserver(latitude, longitude);
  const timeZone = $("zone").value.trim(),
    { date, ambiguous } = parseWallTime(
      $("date").value,
      timeZone,
      $("fold").value,
    ),
    epoch = $("epoch").value,
    refraction = $("refraction").checked;
  let ra,
    dec,
    options = { latitude, longitude, date, epoch, refraction };
  if ($("direction").value === "forward") {
    ra = parseAngle($("coord1").value, "ra", $("ra-unit").value);
    dec = parseAngle($("coord2").value, "dec");
  } else
    ({ ra, dec } = horizontalToEquatorial({
      ...options,
      altitude: parseAngle($("coord1").value, "alt"),
      azimuth: parseAngle($("coord2").value, "az"),
    }));
  return { ...options, ra, dec, timeZone, ambiguous };
}
function addDetail(name, value) {
  $("details").append(element("dt", name), element("dd", value));
}
function calculate() {
  try {
    const options = collect(),
      h = equatorialToHorizontal(options),
      curve = visibility(options),
      transit = nextTransit(options),
      crossings = horizonCrossings(options, curve);
    current = options;
    points = curve;
    const forward = $("direction").value === "forward";
    $("result1-label").textContent = forward ? "Altitude" : "Right ascension";
    $("result2-label").textContent = forward ? "Azimuth" : "Declination";
    $("result1").textContent = forward
      ? precise(h.altitude)
      : sexagesimal(options.ra);
    $("result2").textContent = forward
      ? h.azimuthDefined
        ? precise(h.azimuth)
        : "Undefined"
      : sexagesimal(options.dec, "dec");
    $("result1-note").textContent = forward
      ? options.refraction
        ? "Approximate apparent altitude"
        : "Geometric, without refraction"
      : `${options.ra.toFixed(7)} hours · ${(options.ra * 15).toFixed(6)}°`;
    $("result2-note").textContent = forward
      ? h.azimuthDefined
        ? `${compass(h.azimuth)} · clockwise from north`
        : "At the zenith/nadir, azimuth is undefined"
      : `${options.dec.toFixed(7)}°`;
    $("visibility").textContent =
      h.altitude >= 0 ? "Above level horizon" : "Below level horizon";
    $("instant").textContent =
      `${fmt(options.date)} (${options.timeZone}) · ${options.date.toISOString().replace("T", " ").replace(".000Z", " UTC")}`;
    $("details").replaceChildren();
    addDetail("Local apparent sidereal time", sexagesimal(h.lst));
    addDetail(
      "Hour angle",
      `${h.hourAngle.toFixed(5)} h (${h.hourAngle < 0 ? "east of" : "west of"} meridian)`,
    );
    addDetail(
      "Equator-of-date position",
      `${sexagesimal(h.raOfDate)} RA / ${sexagesimal(h.decOfDate, "dec")} Dec`,
    );
    addDetail(
      "Next upper transit",
      transit
        ? `${fmt(transit)} (${options.timeZone})`
        : "Not uniquely defined at the celestial/geographic pole",
    );
    $("precision").textContent =
      `${options.epoch === "J2000" ? "J2000 precession and nutation are included." : "Coordinates use the true equator of the observation date."} Fixed direction: no proper motion, parallax or aberration. ${options.refraction ? "Standard refraction is approximate, especially close to the horizon." : "Atmospheric refraction is off."}`;
    drawChart();
    $("events").replaceChildren(
      ...crossings.map((e) => element("span", `${e.kind}: ${fmt(e.date)}`)),
    );
    if (!crossings.length)
      $("events").append(
        element(
          "span",
          curve.every((p) => p.altitude >= 0)
            ? "All sampled positions are above the level horizon"
            : curve.every((p) => p.altitude < 0)
              ? "All sampled positions are below the level horizon"
              : "No sampled horizon crossing",
        ),
      );
    $("cursor").max = points.length - 1;
    $("cursor").value = 0;
    cursor();
    $("curve-table").replaceChildren();
    const start = Date.parse(points[0].date);
    for (const [p, i] of points.map((p, i) => [p, i])) {
      if (
        i !== 0 &&
        i !== points.length - 1 &&
        Math.floor((Date.parse(p.date) - start) / 3600000) ===
          Math.floor((Date.parse(points[i - 1].date) - start) / 3600000)
      )
        continue;
      const row = element("tr");
      row.append(
        element("td", fmt(p.date)),
        element("td", precise(p.altitude)),
        element("td", precise(p.azimuth)),
        element("td", precise(p.sunAltitude)),
      );
      $("curve-table").append(row);
    }
    message(
      `Calculated locally.${options.ambiguous ? ` This local time occurs twice; using the ${$("fold").value === "later" ? "second" : "first"} occurrence.` : ""}`,
    );
    return true;
  } catch (e) {
    message(e.message, true);
    return false;
  }
}
function svg(tag, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
function drawChart() {
  const width = 680,
    height = 270,
    left = 42,
    right = 18,
    top = 16,
    bottom = 35,
    w = width - left - right,
    h = height - top - bottom,
    x = (i) =>
      left +
      ((Date.parse(points[i].date) - Date.parse(points[0].date)) / 86400000) *
        w,
    y = (a) => top + ((90 - a) / 180) * h;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "presentation",
  });
  for (let i = 0; i < points.length - 1; i++) {
    const alt = points[i].sunAltitude;
    chart.append(
      svg("rect", {
        x: x(i),
        y: top,
        width: x(i + 1) - x(i) + 0.2,
        height: h,
        fill: alt <= -18 ? "#10152c" : alt < 0 ? "#393956" : "#303e56",
      }),
    );
  }
  for (const alt of [-90, -45, 0, 45, 90]) {
    chart.append(
      svg("line", {
        x1: left,
        y1: y(alt),
        x2: width - right,
        y2: y(alt),
        stroke: alt === 0 ? "#8c95b2" : "#4b5370",
        "stroke-width": alt === 0 ? 1.4 : 0.6,
      }),
      svg(
        "text",
        { x: left - 8, y: y(alt) + 4, "text-anchor": "end" },
        `${alt}°`,
      ),
    );
  }
  for (let i = 0; i <= 4; i++) {
    const index = Math.round((i * (points.length - 1)) / 4),
      label = new Intl.DateTimeFormat("en-GB", {
        timeZone: current.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(points[index].date));
    chart.append(
      svg(
        "text",
        {
          x: x(index),
          y: height - 10,
          "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle",
        },
        label,
      ),
    );
  }
  chart.append(
    svg("path", {
      d: points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(p.altitude).toFixed(2)}`,
        )
        .join(" "),
      fill: "none",
      stroke: "#c1bbff",
      "stroke-width": 2.5,
    }),
    svg("line", {
      id: "chart-cursor",
      x1: left,
      x2: left,
      y1: top,
      y2: height - bottom,
      stroke: "#ffd397",
      "stroke-width": 1,
      "stroke-dasharray": "4 3",
    }),
    svg("circle", {
      id: "chart-point",
      cx: left,
      cy: y(points[0].altitude),
      r: 4,
      fill: "#ffd397",
    }),
  );
  $("chart").replaceChildren(chart);
  $("chart").setAttribute(
    "aria-label",
    `Target altitude for 24 hours from ${fmt(current.date)} in ${current.timeZone}. Use the following slider or table for exact values.`,
  );
}
function cursor() {
  if (!points.length) return;
  const index = Number($("cursor").value),
    p = points[index];
  $("cursor-value").textContent =
    `${fmt(p.date)} · altitude ${precise(p.altitude)} · azimuth ${precise(p.azimuth)} ${compass(p.azimuth)} · ${p.sunAltitude <= -18 ? "astronomical night" : p.sunAltitude < 0 ? "twilight" : "daylight"}`;
  const x =
      42 + ((Date.parse(p.date) - Date.parse(points[0].date)) / 86400000) * 620,
    y = 16 + ((90 - p.altitude) / 180) * 219;
  $("chart-cursor")?.setAttribute("x1", x);
  $("chart-cursor")?.setAttribute("x2", x);
  $("chart-point")?.setAttribute("cx", x);
  $("chart-point")?.setAttribute("cy", y);
}
function download(text, name, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = element("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("batch-limit").textContent =
  `Up to ${config.maxCsvRows.toLocaleString()} rows, ${config.maxCsvBytes.toLocaleString()} UTF-8 bytes.`;
$("csv").maxLength = config.maxCsvBytes;
$("place").append(element("option", "Custom location"));
$("place").firstChild.value = "custom";
config.locations.forEach((p, i) => {
  const option = element("option", p.name);
  option.value = i;
  $("place").append(option);
});
$("target").append(element("option", "Custom coordinates"));
$("target").firstChild.value = "custom";
config.targets.forEach((p, i) => {
  const option = element("option", p.name);
  option.value = i;
  $("target").append(option);
});
$("place").value = "0";
$("target").value = "0";
$("zone").value = "UTC";
$("date").value = wallTime(new Date(), "UTC");
location(0);
setTarget(0);
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved) {
    validateObserver(saved.latitude, saved.longitude);
    new Intl.DateTimeFormat("en", { timeZone: saved.timeZone });
    $("latitude").value = saved.latitude;
    $("longitude").value = saved.longitude;
    $("place").value = "custom";
    zoneChange(saved.timeZone);
    $("forget").hidden = false;
  }
} catch {
  /* Invalid/blocked storage leaves defaults intact. */
}
$("calculate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  calculate();
});
$("place").onchange = () => location(Number($("place").value));
for (const id of ["latitude", "longitude"])
  $(id).addEventListener("input", () => {
    $("place").value = "custom";
  });
$("target").onchange = () => setTarget(Number($("target").value));
for (const id of ["coord1", "coord2"])
  $(id).addEventListener("input", () => {
    $("target").value = "custom";
  });
$("zone").onchange = () => zoneChange($("zone").value.trim());
$("now").onclick = () => {
  try {
    $("date").value = wallTime(new Date(), $("zone").value);
    oldZone = $("zone").value;
  } catch {
    message("Enter a valid time zone first.", true);
  }
};
$("cursor").oninput = cursor;
$("ra-unit").onchange = () => {
  const next = $("ra-unit").value;
  for (const id of $("direction").value === "forward"
    ? ["coord1", "ra2"]
    : ["ra2"])
    try {
      const ra = parseAngle($(id).value, "ra", oldUnits);
      $(id).value = next === "hours" ? sexagesimal(ra) : (ra * 15).toFixed(6);
    } catch {
      /* Keep incomplete input for correction. */
    }
  oldUnits = next;
};
$("direction").onchange = () => {
  const forward = $("direction").value === "forward";
  $("coord1-label").textContent = forward ? "Right ascension" : "Altitude °";
  $("coord2-label").textContent = forward ? "Declination °" : "Azimuth °";
  $("target-control").hidden = !forward;
  if (current) {
    const h = equatorialToHorizontal(current);
    $("coord1").value = forward
      ? $("ra-unit").value === "hours"
        ? sexagesimal(current.ra)
        : (current.ra * 15).toFixed(6)
      : h.altitude.toFixed(6);
    $("coord2").value = forward
      ? sexagesimal(current.dec, "dec")
      : h.azimuth.toFixed(6);
  } else {
    $("coord1").value = forward ? "00:42:44.3" : "30";
    $("coord2").value = forward ? "+41:16:09" : "180";
  }
};
$("locate").onclick = () => {
  if (!navigator.geolocation) {
    message(
      "This browser does not support geolocation. Enter coordinates instead.",
      true,
    );
    return;
  }
  message("Waiting for location permission…");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      $("latitude").value = p.coords.latitude.toFixed(6);
      $("longitude").value = p.coords.longitude.toFixed(6);
      $("place").value = "custom";
      message("Location filled. Check the time zone, then calculate.");
    },
    () =>
      message(
        "Location unavailable or permission declined. You can enter coordinates manually.",
        true,
      ),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
};
$("remember").onclick = () => {
  try {
    const latitude = Number($("latitude").value),
      longitude = Number($("longitude").value),
      timeZone = $("zone").value.trim();
    if (!$("latitude").value || !$("longitude").value)
      throw new Error("Enter a location first.");
    validateObserver(latitude, longitude);
    new Intl.DateTimeFormat("en", { timeZone });
    localStorage.setItem(
      key,
      JSON.stringify({ latitude, longitude, timeZone }),
    );
    $("forget").hidden = false;
    message(
      "Location saved in this browser only. Targets and CSVs are not saved.",
    );
  } catch (e) {
    message(`Could not save location: ${e.message}`, true);
  }
};
$("forget").onclick = () => {
  try {
    localStorage.removeItem(key);
    $("forget").hidden = true;
    message("Saved location removed.");
  } catch {
    message("Browser storage is unavailable.", true);
  }
};
$("separation-form").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!current) throw new Error("Calculate the first target first.");
    const ra = parseAngle($("ra2").value, "ra", $("ra-unit").value),
      dec = parseAngle($("dec2").value),
      sep = angularSeparation(current.ra, current.dec, ra, dec);
    $("separation-result").textContent =
      `${sep.toFixed(5)}° · ${(sep * 60).toFixed(3)} arcminutes · ${(sep * 3600).toFixed(1)} arcseconds`;
  } catch (e) {
    $("separation-result").textContent = e.message;
  }
};
$("csv-example").onclick = () => {
  $("csv").value = [
    "name,ra,dec",
    ...config.targets.map((t) => `${t.name},${t.ra},${t.dec}`),
  ].join("\n");
  $("ra-unit").value = "hours";
  $("ra-unit").dispatchEvent(new Event("change"));
  $("epoch").value = "J2000";
  $("csv-status").textContent =
    "Examples use J2000 and hours; those settings have been selected.";
};
$("csv-convert").onclick = () => {
  batch = [];
  $("csv-download").hidden = true;
  $("csv-table").hidden = true;
  try {
    if (!calculate())
      throw new Error("Correct the viewpoint and target above first.");
    batch = convertCsv($("csv").value, current, $("ra-unit").value);
    $("csv-results").replaceChildren();
    for (const r of batch.slice(0, 100)) {
      const row = element("tr");
      row.append(
        element("td", r.name || `Row ${r.line}`),
        element("td", r.error ? "—" : precise(r.altitude)),
        element("td", r.error ? "—" : precise(r.azimuth)),
        element("td", r.error || "Converted"),
      );
      $("csv-results").append(row);
    }
    $("csv-table").hidden = false;
    $("csv-download").hidden = !batch.length;
    const errors = batch.filter((r) => r.error).length;
    $("csv-status").textContent =
      `${batch.length - errors} converted, ${errors} errors · ${current.date.toISOString()} · ${current.epoch}. ${batch.length > 100 ? "Preview shows the first 100 rows; download includes all rows." : ""}`;
  } catch (e) {
    $("csv-status").textContent = e.message;
  }
};
$("csv-download").onclick = () =>
  download(csvExport(batch), "skygeometry-targets.csv");
$("csv-clear").onclick = () => {
  $("csv").value = "";
  batch = [];
  $("csv-results").replaceChildren();
  $("csv-table").hidden = true;
  $("csv-download").hidden = true;
  $("csv-status").textContent = "Target list cleared.";
};
$("download-curve").onclick = () => {
  if (!current) return;
  const lines = [
    "utc,altitude_deg,azimuth_deg,sun_altitude_deg",
    ...points.map((p) =>
      [p.date, p.altitude, p.azimuth, p.sunAltitude].join(","),
    ),
  ];
  download(lines.join("\r\n"), "skygeometry-24-hours.csv");
};
calculate();
