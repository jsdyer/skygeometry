/** Editable starting points. Visitors may use any supported coordinates/location. */
export const config = Object.freeze({
  locations: [
    {
      name: "Langley, BC",
      latitude: 49.1044,
      longitude: -122.6604,
      timeZone: "America/Vancouver",
    },
    {
      name: "Halifax, NS",
      latitude: 44.6488,
      longitude: -63.5752,
      timeZone: "America/Halifax",
    },
    {
      name: "Vancouver, BC",
      latitude: 49.2827,
      longitude: -123.1207,
      timeZone: "America/Vancouver",
    },
    {
      name: "Charlottetown, PE",
      latitude: 46.2382,
      longitude: -63.1311,
      timeZone: "America/Halifax",
    },
  ],
  targets: [
    {
      name: "Andromeda Galaxy · M31",
      ra: "00:42:44.3",
      dec: "+41:16:09",
      epoch: "J2000",
    },
    {
      name: "Orion Nebula · M42",
      ra: "05:35:17.3",
      dec: "-05:23:28",
      epoch: "J2000",
    },
    { name: "Sirius", ra: "06:45:08.9", dec: "-16:42:58", epoch: "J2000" },
    { name: "Polaris", ra: "02:31:49.1", dec: "+89:15:51", epoch: "J2000" },
  ],
  plotStepMinutes: 10,
  maxCsvRows: 2000,
  maxCsvBytes: 1024 * 1024,
});
