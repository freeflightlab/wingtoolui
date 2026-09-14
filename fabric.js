/* fabric.js — a wing is not made of one cloth.
 *
 * The bill of materials has carried four cloth weights — upper sail, lower
 * sail, rib, diagonal — and a real specification has twice that. Niviuk's own
 * sheet for the Bi Skin 2 P lists nine:
 *
 *   upper surface leading edge   Porcher 9017 E25     a harder finish
 *   upper surface                Porcher 70032 E3W
 *   lower surface                Porcher 70032 E3W
 *   ribs                         Porcher 70032 E4D    a different finish
 *   loops                        Kolon LKI-10
 *   reinforcement loops          Porcher 9017         the LE cloth reused
 *   trailing edge reinforcement  Mylar 20             not fabric
 *   rib reinforcement            LTN-0.8 stick        a stiffener
 *   thread                       Amann Serafil 60
 *
 * The differences are not arbitrary. The nose takes a harder finish because
 * it is the part that has to hold its shape unpressurised and takes the most
 * handling. The ribs take a different weave because they work in tension
 * across their whole depth rather than in a bulging membrane. The trailing
 * edge takes Mylar because cloth there flutters.
 *
 * Weight alone cannot express any of that, and weight alone is what the
 * model had.
 */

/**
 * Cloth by name, with what a designer chooses on.
 *
 * PROVENANCE: the weights are published by Porcher and Dominico and widely
 * quoted. The `finish` and `use` notes are this project's characterisation of
 * what each is for, not a manufacturer's claim.
 */
export const CLOTH = {
  'Porcher Skytex 27': {
    gsm: 27, finish: 'E3W', use: 'sail', note: 'light, for upper and lower surface',
  },
  'Porcher Skytex 27 hard': {
    gsm: 27, finish: 'E25', use: 'leading edge',
    note: 'hard finish; holds its shape unpressurised',
  },
  'Porcher Skytex 32': {
    gsm: 32, finish: 'E3W', use: 'sail', note: 'the common mid-weight sail cloth',
  },
  'Porcher Skytex 38': {
    gsm: 38, finish: 'E3W', use: 'sail', note: 'heavier sail, school and tandem',
  },
  'Porcher Skytex 40 hard': {
    gsm: 40, finish: 'E4D', use: 'rib', note: 'hard finish for ribs and diagonals',
  },
  'Dominico 30D': {
    gsm: 34, finish: 'MF', use: 'sail', note: 'an alternative sail cloth',
  },
  'Dominico 20D': {
    gsm: 36, finish: 'MF', use: 'sail', note: '',
  },
  'Mylar 20': {
    gsm: 28, finish: 'film', use: 'trailing edge',
    note: 'not fabric; stops the trailing edge fluttering',
  },
};

Object.defineProperty(CLOTH, 'provenance', {
  value: 'weights are published by Porcher and Dominico; the finish and use '
    + 'notes are this project\'s characterisation, not a manufacturer claim',
  enumerable: false,
});

/** Where cloth goes on a wing, in the order a specification lists it. */
export const LOCATIONS = [
  'leadingEdge', 'upperSail', 'lowerSail', 'rib', 'diagonal',
  'trailingEdge', 'reinforcement',
];

/** What a specification looks like when nobody has chosen anything. */
export const DEFAULT_SCHEDULE = {
  leadingEdge: 'Porcher Skytex 27 hard',
  upperSail: 'Porcher Skytex 32',
  lowerSail: 'Porcher Skytex 32',
  rib: 'Porcher Skytex 40 hard',
  diagonal: 'Porcher Skytex 40 hard',
  trailingEdge: 'Mylar 20',
  reinforcement: 'Porcher Skytex 27 hard',
};

/**
 * A fabric schedule, checked for the things that make a wing wrong.
 *
 * The checks are not style. A soft cloth at the nose gives a wing that will
 * not hold its shape on launch; a sail heavier than its ribs is the wrong way
 * round and wastes weight where it does nothing.
 */
export function fabricSchedule(spec = {}, { library = CLOTH } = {}) {
  const schedule = { ...DEFAULT_SCHEDULE, ...spec };
  const problems = [];
  const resolved = {};

  for (const loc of LOCATIONS) {
    const name = schedule[loc];
    const cloth = library[name];
    if (!cloth) {
      problems.push(`${loc}: "${name}" is not in the cloth library; have `
        + `${Object.keys(library).join(', ')}`);
      continue;
    }
    resolved[loc] = { name, ...cloth };
  }
  if (problems.length) {
    return { schedule, resolved, problems, ok: false, note: problems[0] };
  }

  // The nose has to hold its shape when the wing is not pressurised, which is
  // what a hard finish is for.
  if (resolved.leadingEdge.finish === 'E3W') {
    problems.push('the leading edge has a soft-finish cloth; the nose is the '
      + 'part that must hold its shape unpressurised');
  }

  // Ribs work in tension across their depth, not as a bulging membrane, and
  // a sail heavier than its ribs puts the weight where it does least.
  if (resolved.rib.gsm < resolved.upperSail.gsm) {
    problems.push(`the sail (${resolved.upperSail.gsm} g/m2) is heavier than `
      + `the ribs (${resolved.rib.gsm} g/m2), which is the wrong way round`);
  }

  const distinct = new Set(Object.values(resolved).map((c) => c.name));
  const totalGsm = Object.fromEntries(
    Object.entries(resolved).map(([k, v]) => [k, v.gsm]));

  return {
    schedule,
    resolved,
    problems,
    ok: problems.length === 0,
    distinctCloths: distinct.size,
    gsmByLocation: totalGsm,
    // A workshop stocks rolls, so the count matters the same way line types
    // do.
    cloths: [...distinct],
    note: problems.length === 0
      ? `${distinct.size} cloths across ${LOCATIONS.length} locations`
      : `${problems.length} problem(s): ${problems[0]}`,
  };
}

/** The weights the bill of materials wants, from a schedule. */
export function clothWeightsFor(schedule) {
  if (!schedule.ok) {
    throw new Error(`clothWeightsFor: the schedule has problems — ${schedule.problems[0]}`);
  }
  const kg = (loc) => schedule.resolved[loc].gsm / 1000;
  return {
    upperSail: kg('upperSail'),
    lowerSail: kg('lowerSail'),
    rib: kg('rib'),
    diagonal: kg('diagonal'),
  };
}
