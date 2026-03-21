import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const NUMBER_TYPES = {
  premiumRate: 'premium_rate',
  tollFree: 'toll_free',
  sharedCost: 'shared_cost',
  mobile: 'mobile',
  fixedLine: 'fixed_line',
  voip: 'voip',
  personalNumber: 'personal_number',
  pager: 'pager',
  uan: 'uan',
  voicemail: 'voicemail',
};

const NUMBER_TYPE_KEYS = Object.keys(NUMBER_TYPES);
const COUNTRY_NAME_OVERRIDES = {
  '001': 'International',
  AC: 'Ascension Island',
  TA: 'Tristan da Cunha',
  XK: 'Kosovo',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

function toArray(value) {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getText(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object' && typeof value['#text'] === 'string') {
    return value['#text'];
  }

  return null;
}

function normalizePattern(value) {
  const text = getText(value);

  if (!text) {
    return null;
  }

  const stripped = text.replace(/\s+/g, '');
  return stripped ? `^${stripped}$` : null;
}

function parseLengthSpec(value) {
  if (value == null) {
    return [];
  }

  const normalized = String(value).replace(/\s+/g, '');
  if (!normalized) {
    return [];
  }

  const lengths = new Set();

  for (const token of normalized.split(',')) {
    if (!token) {
      continue;
    }

    const rangeMatch = token.match(/^\[(\d+)-(\d+)\]$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);

      for (let current = start; current <= end; current += 1) {
        lengths.add(current);
      }

      continue;
    }

    if (/^\d+$/.test(token)) {
      lengths.add(Number(token));
    }
  }

  return [...lengths].sort((a, b) => a - b);
}

function collectFallbackLengths(territory, attributeName) {
  const all = NUMBER_TYPE_KEYS.flatMap(typeKey => {
    const spec = territory[typeKey]?.possibleLengths?.[`@_${attributeName}`];
    return parseLengthSpec(spec);
  });
  return [...new Set(all)].sort((a, b) => a - b);
}

function resolveNumberLengths(territory) {
  const generalLengths = territory.generalDesc?.possibleLengths;
  const national = generalLengths?.['@_national'];
  const localOnly = generalLengths?.['@_localOnly'];

  const numberLengths = national != null
    ? parseLengthSpec(national)
    : collectFallbackLengths(territory, 'national');

  let localLengths = null;
  if (localOnly != null) {
    localLengths = parseLengthSpec(localOnly);
  } else if (!generalLengths) {
    const fallbackLocalLengths = collectFallbackLengths(territory, 'localOnly');
    if (fallbackLocalLengths.length > 0) {
      localLengths = fallbackLocalLengths;
    }
  }

  return {
    numberLengths,
    localLengths,
  };
}

function getCountryName(code, displayNames) {
  return COUNTRY_NAME_OVERRIDES[code] || displayNames.of(code) || code;
}

function buildCountryNames(territories) {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countryNames = new Map();

  for (const territory of territories) {
    const id = territory['@_id'];
    if (!countryNames.has(id)) {
      countryNames.set(id, getCountryName(id, displayNames));
    }
  }

  return Object.fromEntries(
    [...countryNames.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function extractPatterns(territory) {
  const patterns = {};

  for (const [xmlKey, jsonKey] of Object.entries(NUMBER_TYPES)) {
    patterns[jsonKey] = territory[xmlKey] ? normalizePattern(territory[xmlKey].nationalNumberPattern) : null;
  }

  return patterns;
}

function extractExampleNumbers(territory) {
  const examples = {};

  for (const [xmlKey, jsonKey] of Object.entries(NUMBER_TYPES)) {
    const example = getText(territory[xmlKey]?.exampleNumber);
    if (example) {
      examples[jsonKey] = example.trim();
    }
  }

  return examples;
}

function extractTerritoryData(territory) {
  const { numberLengths, localLengths } = resolveNumberLengths(territory);

  return {
    country_code: String(territory['@_countryCode']),
    main_country_for_code: territory['@_mainCountryForCode'] === 'true',
    leading_digits: territory['@_leadingDigits'] ?? null,
    number_lengths: numberLengths,
    local_lengths: localLengths,
    patterns: extractPatterns(territory),
    example_numbers: extractExampleNumbers(territory),
  };
}

function validateOutput(output, sizeBytes) {
  const territoryCount = Object.keys(output.territories).length + Object.keys(output.non_geographic).length;
  if (territoryCount < 200) {
    throw new Error(`Validation failed: expected at least 200 total entries, found ${territoryCount}.`);
  }

  let premiumRateCount = 0;
  for (const t of Object.values(output.territories)) {
    if (t.patterns.premium_rate !== null) premiumRateCount++;
  }
  for (const t of Object.values(output.non_geographic)) {
    if (t.patterns.premium_rate !== null) premiumRateCount++;
  }

  if (premiumRateCount < 30) {
    throw new Error(
      `Validation failed: expected at least 30 territories with premium_rate patterns, found ${premiumRateCount}.`,
    );
  }

  const sizeKB = (sizeBytes / 1024).toFixed(1);
  if (sizeBytes > 1024 * 1024) {
    throw new Error(`Validation failed: phone-metadata.json is ${sizeKB} KB, which exceeds 1024 KB.`);
  }
  if (sizeBytes > 500 * 1024) {
    console.error(`Warning: phone-metadata.json is ${sizeKB} KB.`);
  }

  for (const territoryKey of Object.keys(output.territories)) {
    if (!output.country_names[territoryKey]) {
      throw new Error(`Validation failed: missing country_names entry for territory ${territoryKey}.`);
    }
  }

  if (!output.country_names['001']) {
    throw new Error('Validation failed: missing country_names entry for territory 001.');
  }
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    fail('Usage: node build/extract.mjs PhoneNumberMetadata.xml');
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.join(repoRoot, 'phone-metadata.json');

  console.error('Parsing XML...');
  const xml = await readFile(inputPath, 'utf8');
  const parsed = parser.parse(xml);
  const territories = toArray(parsed?.phoneNumberMetadata?.territories?.territory);

  if (territories.length === 0) {
    throw new Error('No territories were found in the XML input.');
  }

  const idCounts = territories.reduce((counts, territory) => {
    const id = territory['@_id'];
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});

  const geographicEntries = [];
  const nonGeographicEntries = [];

  for (const territory of territories) {
    const id = territory['@_id'];
    const data = extractTerritoryData(territory);

    if (id === '001' && (idCounts[id] ?? 0) > 1) {
      nonGeographicEntries.push([data.country_code, data]);
      continue;
    }

    geographicEntries.push([id, data]);
  }

  const now = new Date();
  const output = {
    version: now.toISOString().slice(0, 10).replaceAll('-', '.'),
    source: 'libphonenumber',
    generated_at: now.toISOString(),
    territories: Object.fromEntries(
      geographicEntries.sort(([left], [right]) => left.localeCompare(right)),
    ),
    non_geographic: Object.fromEntries(
      nonGeographicEntries.sort(([left], [right]) => left.localeCompare(right)),
    ),
    country_names: buildCountryNames(territories),
  };

  const jsonString = `${JSON.stringify(output, null, 2)}\n`;
  const sizeBytes = Buffer.byteLength(jsonString, 'utf8');

  validateOutput(output, sizeBytes);

  console.error(
    `Extracted ${Object.keys(output.territories).length} territories and ${Object.keys(output.non_geographic).length} non-geographic entries`,
  );
  await writeFile(outputPath, jsonString, 'utf8');
  console.error(`Written phone-metadata.json (${(sizeBytes / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
