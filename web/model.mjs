import * as A from "./vendor/astronomy.mjs";
import { config } from "./config.mjs";
const mod = (n, m) => ((n % m) + m) % m;
const rad = Math.PI / 180;
export function parseAngle(input, kind = "dec", raUnit = "hours") {
  let text = String(input).trim().replace(/−/g, "-");
  if (!text) throw new Error("Enter a coordinate.");
  text = text
    .replace(/[hHdD°ºmM′'sS″"]/g, ":")
    .replace(/\s+/g, ":")
    .replace(/:+$/, "")
    .replace(/:+/g, ":");
  if (!/^[+-]?\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(text))
    throw new Error(
      "Use decimal or sexagesimal coordinates, for example 05:35:17.3.",
    );
  const negative = text.startsWith("-"),
    parts = text.replace(/^[+-]/, "").split(":").map(Number);
  if (parts.slice(1).some((n) => n >= 60))
    throw new Error("Minutes and seconds must be below 60.");
  if (
    (parts.length > 1 && !Number.isInteger(parts[0])) ||
    (parts.length > 2 && !Number.isInteger(parts[1]))
  )
    throw new Error(
      "Only the last sexagesimal component may contain a decimal.",
    );
  let value =
    (parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600) *
    (negative ? -1 : 1);
  if (!Number.isFinite(value)) throw new Error("Coordinate must be finite.");
  if (kind === "ra") {
    const max = raUnit === "degrees" ? 360 : 24;
    if (value < 0 || value > max)
      throw new Error(
        `Right ascension must be between 0 and ${max} ${raUnit}.`,
      );
    return mod(raUnit === "degrees" ? value / 15 : value, 24);
  }
  if (kind === "az") {
    if (value < 0 || value > 360)
      throw new Error("Azimuth must be between 0 and 360 degrees.");
    return mod(value, 360);
  }
  if (value < -90 || value > 90)
    throw new Error(
      "Declination/altitude must be between −90 and +90 degrees.",
    );
  return value;
}
export function sexagesimal(value, kind = "ra") {
  const sign = kind === "ra" ? "" : value < 0 ? "−" : "+";
  let ticks = Math.round(Math.abs(value) * 3600 * 100);
  if (kind === "ra") ticks = mod(ticks, 24 * 3600 * 100);
  const a = Math.floor(ticks / 360000),
    b = Math.floor((ticks % 360000) / 6000),
    c = (ticks % 6000) / 100;
  return `${sign}${String(a).padStart(2, "0")}:${String(b).padStart(2, "0")}:${c.toFixed(2).padStart(5, "0")}`;
}
export function validateObserver(latitude, longitude) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    throw new Error(
      "Use latitude −90…90 and longitude −180…180, east positive.",
    );
  return new A.Observer(latitude, longitude, 0);
}
function validDate(date) {
  if (
    !(date instanceof Date) ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1600 ||
    date.getUTCFullYear() > 2200
  )
    throw new Error("Choose a valid date between 1600 and 2200.");
  return date;
}
function epochCheck(epoch) {
  if (!["J2000", "ofdate"].includes(epoch))
    throw new Error("Choose J2000 or equator of date.");
}
function finiteAngle(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Invalid ${label}.`);
}
export function equatorialToHorizontal({
  ra,
  dec,
  date,
  latitude,
  longitude,
  epoch = "J2000",
  refraction = false,
}) {
  validDate(date);
  epochCheck(epoch);
  finiteAngle(ra, 0, 24, "right ascension");
  finiteAngle(dec, -90, 90, "declination");
  const observer = validateObserver(latitude, longitude),
    vector = A.VectorFromSphere(new A.Spherical(dec, ra * 15, 1), date);
  const rotation =
    epoch === "J2000"
      ? A.Rotation_EQJ_HOR(date, observer)
      : A.Rotation_EQD_HOR(date, observer);
  const horizon = A.HorizonFromVector(
    A.RotateVector(rotation, vector),
    refraction ? "normal" : null,
  );
  const eqd =
    epoch === "J2000"
      ? A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(date), vector))
      : { ra, dec };
  const lst = mod(A.SiderealTime(date) + longitude / 15, 24),
    hourAngle = mod(lst - eqd.ra + 12, 24) - 12;
  return {
    altitude: horizon.lat,
    azimuth: horizon.lon,
    raOfDate: eqd.ra,
    decOfDate: eqd.dec,
    lst,
    hourAngle,
    azimuthDefined: Math.abs(horizon.lat) < 89.999999,
  };
}
export function horizontalToEquatorial({
  altitude,
  azimuth,
  date,
  latitude,
  longitude,
  epoch = "J2000",
  refraction = false,
}) {
  validDate(date);
  epochCheck(epoch);
  finiteAngle(altitude, -90, 90, "altitude");
  finiteAngle(azimuth, 0, 360, "azimuth");
  const observer = validateObserver(latitude, longitude),
    vector = A.VectorFromHorizon(
      new A.Spherical(altitude, azimuth, 1),
      date,
      refraction ? "normal" : null,
    );
  const rotation =
      epoch === "J2000"
        ? A.Rotation_HOR_EQJ(date, observer)
        : A.Rotation_HOR_EQD(date, observer),
    equator = A.EquatorFromVector(A.RotateVector(rotation, vector));
  return { ra: equator.ra, dec: equator.dec };
}
export function angularSeparation(ra1, dec1, ra2, dec2) {
  for (const n of [ra1, ra2]) finiteAngle(n, 0, 24, "right ascension");
  for (const n of [dec1, dec2]) finiteAngle(n, -90, 90, "declination");
  const vector = (ra, dec) => [
      Math.cos(dec * rad) * Math.cos(ra * 15 * rad),
      Math.cos(dec * rad) * Math.sin(ra * 15 * rad),
      Math.sin(dec * rad),
    ],
    a = vector(ra1, dec1),
    b = vector(ra2, dec2),
    cross = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  return (
    Math.atan2(
      Math.hypot(...cross),
      a.reduce((sum, v, i) => sum + v * b[i], 0),
    ) / rad
  );
}
export function nextTransit(options) {
  if (
    Math.abs(options.dec) >= 89.999999 ||
    Math.abs(options.latitude) >= 89.999999
  )
    return null;
  const h = equatorialToHorizontal(options).hourAngle;
  let milliseconds =
    options.date.getTime() + (mod(-h, 24) / 1.00273790935) * 3600000;
  for (let i = 0; i < 5; i++) {
    const ha = equatorialToHorizontal({
      ...options,
      date: new Date(milliseconds),
    }).hourAngle;
    milliseconds -= (ha / 1.00273790935) * 3600000;
  }
  if (milliseconds < options.date.getTime() - 1000) milliseconds += 86164090.5;
  return new Date(milliseconds);
}
export function visibility(options, stepMinutes = config.plotStepMinutes) {
  if (!Number.isFinite(stepMinutes) || stepMinutes < 1 || stepMinutes > 60)
    throw new Error("Plot interval must be between 1 and 60 minutes.");
  const observer = validateObserver(options.latitude, options.longitude),
    points = [];
  for (let m = 0; ; m = Math.min(1440, m + stepMinutes)) {
    const date = new Date(options.date.getTime() + m * 60000),
      horizontal = equatorialToHorizontal({ ...options, date });
    const sun = A.Equator("Sun", date, observer, true, true),
      sunAlt = A.Horizon(date, observer, sun.ra, sun.dec, null).altitude;
    points.push({
      date: date.toISOString(),
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      sunAltitude: sunAlt,
    });
    if (m === 1440) break;
  }
  return points;
}
export function horizonCrossings(options, points) {
  const result = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (
      (a.altitude < 0 && b.altitude >= 0) ||
      (a.altitude >= 0 && b.altitude < 0)
    ) {
      let left = new Date(a.date).getTime(),
        right = new Date(b.date).getTime();
      const rising = b.altitude > a.altitude;
      for (let n = 0; n < 18; n++) {
        const mid = (left + right) / 2,
          alt = equatorialToHorizontal({
            ...options,
            date: new Date(mid),
          }).altitude;
        if (alt >= 0 === rising) right = mid;
        else left = mid;
      }
      result.push({
        kind: rising ? "Rise" : "Set",
        date: new Date((left + right) / 2),
      });
    }
  }
  return result;
}
function dateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
export function wallTime(date, timeZone = "UTC") {
  const p = dateParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}`;
}
export function parseWallTime(input, timeZone = "UTC", fold = "earlier") {
  const m = String(input).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) throw new Error("Enter a complete date and time.");
  const [year, month, day, hour, minute, second] = m
      .slice(1)
      .map((v) => Number(v || 0)),
    naive = Date.UTC(year, month - 1, day, hour, minute, second),
    utc = new Date(naive);
  if (
    year < 1600 ||
    year > 2200 ||
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new Error("Choose a valid calendar date/time between 1600 and 2200.");
  let offsets;
  try {
    offsets = new Set(
      [-36, -18, -6, 0, 6, 18, 36].map((h) => {
        const t = naive + h * 3600000,
          p = dateParts(new Date(t), timeZone);
        return (
          Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t
        );
      }),
    );
  } catch {
    throw new Error(
      "Enter a valid IANA time zone, for example America/Halifax or UTC.",
    );
  }
  const expected = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${String(second).padStart(2, "0")}`;
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((date) => wallTime(date, timeZone) === expected)
    .sort((a, b) => a - b);
  if (!matches.length)
    throw new Error(
      "This local time does not exist because the clock jumps forward. Choose another time or UTC.",
    );
  return {
    date: matches[fold === "later" ? matches.length - 1 : 0],
    ambiguous: matches.length > 1,
  };
}
export function parseCsv(text, limit = config.maxCsvRows) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > config.maxCsvBytes
  )
    throw new Error(
      `CSV exceeds the ${config.maxCsvBytes.toLocaleString()}-byte input limit.`,
    );
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw new Error("Unclosed CSV quote.");
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"' && !cell && !closed) {
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r" || c === undefined) {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (rows.length > limit + 1)
          throw new Error(`CSV is limited to ${limit} targets.`);
      }
      continue;
    }
    if (closed && c !== " " && c !== "\t")
      throw new Error("Unexpected text after a CSV quote.");
    if (!closed) cell += c;
  }
  if (!rows.length) throw new Error("Paste a CSV with the header name,ra,dec.");
  const header = rows.shift().map((v) => v.trim().toLowerCase());
  if (
    header.length !== 3 ||
    new Set(header).size !== 3 ||
    !["name", "ra", "dec"].every((v) => header.includes(v))
  )
    throw new Error("CSV header must contain name,ra,dec.");
  return rows.map((r, i) => {
    if (r.length !== 3)
      return { line: i + 2, error: "Expected three CSV fields." };
    return {
      line: i + 2,
      name: r[header.indexOf("name")],
      ra: r[header.indexOf("ra")],
      dec: r[header.indexOf("dec")],
    };
  });
}
export function convertCsv(text, options, raUnit = "hours") {
  return parseCsv(text).map((row) => {
    if (row.error) return row;
    try {
      const ra = parseAngle(row.ra, "ra", raUnit),
        dec = parseAngle(row.dec);
      const h = equatorialToHorizontal({ ...options, ra, dec });
      return {
        ...row,
        raHours: ra,
        declination: dec,
        altitude: h.altitude,
        azimuth: h.azimuth,
        date: options.date.toISOString(),
      };
    } catch (e) {
      return { ...row, error: e.message };
    }
  });
}
export function csvExport(rows) {
  const safe = (value) => {
    let text = String(value ?? "");
    if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text))
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return [
    "name,ra_hours,dec_degrees,alt_degrees,az_degrees,utc,error",
    ...rows.map((r) =>
      [r.name, r.raHours, r.declination, r.altitude, r.azimuth, r.date, r.error]
        .map(safe)
        .join(","),
    ),
  ].join("\r\n");
}
