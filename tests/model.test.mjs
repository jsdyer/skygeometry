import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAngle,
  sexagesimal,
  equatorialToHorizontal,
  horizontalToEquatorial,
  angularSeparation,
  nextTransit,
  visibility,
  horizonCrossings,
  parseWallTime,
  wallTime,
  parseCsv,
  convertCsv,
  csvExport,
  validateObserver,
} from "../web/model.mjs";
import { SiderealTime } from "../web/vendor/astronomy.mjs";
import { config } from "../web/config.mjs";
const close = (a, b, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const context = {
  ra: 0.71230556,
  dec: 41.269167,
  date: new Date("2026-11-25T03:00:00Z"),
  latitude: 49.1044,
  longitude: -122.6604,
  epoch: "J2000",
  refraction: false,
};
test("sexagesimal, Unicode signs and RA units are explicit", () => {
  close(parseAngle("05:35:17.3", "ra"), 5 + 35 / 60 + 17.3 / 3600);
  close(
    parseAngle("83.822083333", "ra", "degrees"),
    5 + 35 / 60 + 17.3 / 3600,
    1e-8,
  );
  close(parseAngle("−00:30:00"), -0.5);
  assert.equal(parseAngle("24:00:00", "ra"), 0);
  assert.equal(parseAngle("360", "az"), 0);
  assert.equal(sexagesimal(23 + 59 / 60 + 59.999 / 3600), "00:00:00.00");
});
test("rejects non-finite, out-of-range and malformed coordinates", () => {
  for (const value of [
    "",
    "NaN",
    "Infinity",
    "1:60",
    "12.5:30",
    "10:12.5:4",
    "90:00:01",
    "1:2:3:4",
  ])
    assert.throws(() => parseAngle(value));
  assert.throws(() => parseAngle("-1", "ra"));
  assert.throws(() => parseAngle("24:01", "ra"));
  assert.throws(() => validateObserver(91, 0));
});
test("independent Meeus spherical astronomy example agrees to 0.01 degree", () => {
  const h = equatorialToHorizontal({
    ra: 23 + 9 / 60 + 16.641 / 3600,
    dec: -(6 + 43 / 60 + 11.61 / 3600),
    date: new Date("1987-04-10T19:21:00Z"),
    latitude: 38.921389,
    longitude: -77.065556,
    epoch: "ofdate",
  });
  close(h.altitude, 15.1249, 0.01);
  close(h.azimuth, 248.0337, 0.01);
});
test("north celestial pole altitude equals latitude without refraction", () => {
  close(
    equatorialToHorizontal({ ...context, ra: 0, dec: 90, epoch: "ofdate" })
      .altitude,
    context.latitude,
  );
});
test("equatorial zenith and west horizon have known geometry", () => {
  const date = context.date,
    lst = SiderealTime(date);
  const zenith = equatorialToHorizontal({
    ra: lst,
    dec: 0,
    date,
    latitude: 0,
    longitude: 0,
    epoch: "ofdate",
  });
  close(zenith.altitude, 90);
  assert.equal(zenith.azimuthDefined, false);
  const west = equatorialToHorizontal({
    ra: (lst + 18) % 24,
    dec: 0,
    date,
    latitude: 0,
    longitude: 0,
    epoch: "ofdate",
  });
  close(west.altitude, 0);
  close(west.azimuth, 270);
});
test("both epochs and refraction modes round-trip with correct azimuth convention", () => {
  for (const epoch of ["J2000", "ofdate"])
    for (const refraction of [false, true])
      for (const p of [
        [0.1, -50],
        [12, 0],
        [23.9, 70],
      ]) {
        const options = { ...context, ra: p[0], dec: p[1], epoch, refraction },
          h = equatorialToHorizontal(options),
          eq = horizontalToEquatorial({
            ...options,
            altitude: h.altitude,
            azimuth: h.azimuth,
          });
        close(eq.ra, p[0], 1e-7);
        close(eq.dec, p[1], 1e-7);
      }
});
test("J2000 differs from of-date decades after epoch", () => {
  const a = equatorialToHorizontal(context),
    b = equatorialToHorizontal({ ...context, epoch: "ofdate" });
  assert.ok(Math.abs(a.altitude - b.altitude) > 0.01);
});
test("angular separation is stable at zero, antipodes and close pairs", () => {
  close(angularSeparation(0, 0, 0, 0), 0);
  close(angularSeparation(0, 0, 12, 0), 180);
  close(angularSeparation(2, 90, 8, -90), 180);
  close(angularSeparation(0, 0, 1 / 3600 / 15, 0), 1 / 3600, 1e-10);
});
test("next transit has zero hour angle and occurs within a sidereal day", () => {
  const date = nextTransit(context);
  assert.ok(date >= context.date);
  assert.ok(date - context.date < 86400000);
  close(equatorialToHorizontal({ ...context, date }).hourAngle, 0, 1e-6);
  assert.equal(nextTransit({ ...context, dec: 90 }), null);
});
test("visibility retains observation dates and brackets horizon crossings", () => {
  const target = { ...context, dec: -5.4 };
  const p = visibility(target);
  assert.equal(p.length, 145);
  assert.equal(p[0].date, context.date.toISOString());
  assert.equal(Date.parse(p.at(-1).date) - context.date, 86400000);
  const events = horizonCrossings(target, p);
  assert.ok(events.length >= 1);
  for (const event of events)
    close(
      equatorialToHorizontal({ ...target, date: event.date }).altitude,
      0,
      0.0001,
    );
});
test("time zones convert actual instants and reject invalid calendar dates", () => {
  assert.equal(
    parseWallTime("2024-11-24T19:00", "America/Vancouver").date.toISOString(),
    "2024-11-25T03:00:00.000Z",
  );
  assert.equal(
    wallTime(context.date, "America/Halifax"),
    "2026-11-24T23:00:00",
  );
  for (const x of [
    "2026-02-30T10:00",
    "2026-01-01T25:00",
    "2026-01-01",
    "1500-01-01T12:00",
  ])
    assert.throws(() => parseWallTime(x, "UTC"));
  assert.throws(() => parseWallTime("2026-01-01T12:00", "Fake/Zone"));
});
test("spring DST gaps reject; fall repeated hours have explicit choices", () => {
  assert.throws(
    () => parseWallTime("2026-03-08T02:30", "America/Vancouver"),
    /does not exist/,
  );
  const early = parseWallTime("2026-11-01T01:30", "America/Halifax", "earlier"),
    late = parseWallTime("2026-11-01T01:30", "America/Halifax", "later");
  assert.equal(early.ambiguous, true);
  assert.equal(late.date - early.date, 3600000);
  assert.equal(early.date.toISOString(), "2026-11-01T04:30:00.000Z");
});
test("CSV handles quoting, per-row errors and preserves numeric export fields", () => {
  assert.deepEqual(parseCsv('name,ra,dec\n"A, B",1,-2')[0], {
    line: 2,
    name: "A, B",
    ra: "1",
    dec: "-2",
  });
  assert.throws(() => parseCsv('name,ra,dec\n"unclosed,1,2'));
  assert.throws(() => parseCsv("name,ra,dec\na,1,2\nb,1,2", 1), /limited/);
  const rows = convertCsv("name,ra,dec\n=CMD(),1,-2\nBad,invalid,0", context);
  assert.ok(!rows[0].error);
  assert.ok(rows[1].error);
  assert.ok(csvExport(rows).includes('"\'=CMD()"'));
  assert.ok(csvExport(rows).includes('"-2"'));
});
test("configuration can expand without fixed starter-size assumptions", () => {
  const expanded = [
    ...config.targets,
    { name: "Additional target", ra: "18:00:00", dec: "-30:00:00" },
  ];
  const csv = [
    "name,ra,dec",
    ...expanded.map((t) => `${t.name},${t.ra},${t.dec}`),
  ].join("\n");
  assert.equal(convertCsv(csv, context).length, expanded.length);
  const moreLocations = [
    ...config.locations,
    {
      name: "Sydney",
      latitude: -33.8688,
      longitude: 151.2093,
      timeZone: "Australia/Sydney",
    },
  ];
  assert.ok(
    equatorialToHorizontal({ ...context, ...moreLocations.at(-1) }).altitude <
      90,
  );
});

test("non-dividing plot intervals still include the full 24-hour boundary", () => {
  const p = visibility(context, 11);
  assert.equal(Date.parse(p.at(-1).date) - context.date, 86400000);
  assert.ok(p.length < 140);
});
