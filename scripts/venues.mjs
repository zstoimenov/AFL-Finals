/**
 * Where each ground actually is.
 *
 * The app derives everything it can from the games themselves — a club's home
 * grounds, whether an away side is travelling — precisely so nothing has to be
 * maintained by hand. Coordinates are the exception, because no amount of
 * fixture data says where Kardinia Park is, and the weather at kickoff cannot be
 * looked up without them.
 *
 * Keyed by the venue strings Squiggle actually emits, which are terse and
 * historical: "Docklands" rather than Marvel Stadium, "Perth Stadium" rather
 * than Optus. Positions are to about a hundred metres, which is far finer than
 * any weather model resolves — they only need to land on the right suburb.
 *
 * A venue missing from this map is not an error. `fetch-weather.mjs` skips it
 * and the app shows no conditions for that game, which is the same thing it does
 * for a fixture with no venue yet.
 */
export const VENUE_COORDS = {
  'M.C.G.': [-37.82, 144.9834],
  Docklands: [-37.8166, 144.9475],
  'Adelaide Oval': [-34.9156, 138.5961],
  'Perth Stadium': [-31.9511, 115.889],
  Gabba: [-27.4858, 153.0381],
  'S.C.G.': [-33.8915, 151.2247],
  'Kardinia Park': [-38.158, 144.3544],
  Carrara: [-28.0065, 153.369],
  'Sydney Showground': [-33.843, 151.068],
  'York Park': [-41.426, 147.139],
  'Manuka Oval': [-35.3183, 149.1348],
  'Bellerive Oval': [-42.8775, 147.373],
  'Marrara Oval': [-12.399, 130.876],
  'Norwood Oval': [-34.9186, 138.63],
  'Eureka Stadium': [-37.543, 143.829],
  'Traeger Park': [-23.706, 133.874],
  'Barossa Park': [-34.51, 139.0],
  'Adelaide Hills': [-35.067, 138.858],
  'Hands Oval': [-33.335, 115.64],
  'Stadium Australia': [-33.8471, 151.0634],
  "Cazaly's Stadium": [-16.9358, 145.749]
};

/** Coordinates for a venue, or null when it isn't one we know. */
export function venueCoords(venue) {
  return VENUE_COORDS[String(venue ?? '').trim()] ?? null;
}
