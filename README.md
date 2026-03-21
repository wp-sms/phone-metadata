# Phone Metadata

Phone number metadata extracted from Google's [libphonenumber](https://github.com/google/libphonenumber). Country codes, number types, premium-rate patterns, and number length validation for 245+ territories.

Auto-updated weekly. Served via [jsDelivr CDN](https://www.jsdelivr.com/). No API keys required.

**Last updated:** auto-generated

## Installation

### CDN (recommended)

```
https://cdn.jsdelivr.net/gh/wp-sms/phone-metadata@master/phone-metadata.json
```

### Direct download

```bash
curl -sL -o phone-metadata.json \
  https://cdn.jsdelivr.net/gh/wp-sms/phone-metadata@master/phone-metadata.json
```

## Usage

### Node.js

```js
const metadata = JSON.parse(fs.readFileSync('phone-metadata.json', 'utf8'));

// Get US premium-rate pattern
const usPatterns = metadata.territories.US.patterns;
console.log(usPatterns.premium_rate); // "^900[2-9]\\d{6}$"

// Check if a number matches premium-rate
const subscriberNumber = '9002345678';
const isPremium = new RegExp(usPatterns.premium_rate).test(subscriberNumber);
```

### PHP

```php
$json = file_get_contents('phone-metadata.json');
$metadata = json_decode($json, true);

// Get country code for GB
$gb = $metadata['territories']['GB'];
echo $gb['country_code']; // "44"

// Check premium-rate
$pattern = $gb['patterns']['premium_rate'];
if ($pattern && preg_match('/' . $pattern . '/', $subscriberNumber)) {
    echo 'Premium-rate number detected';
}
```

### Python

```python
import json, re

with open('phone-metadata.json') as f:
    metadata = json.load(f)

us = metadata['territories']['US']
pattern = us['patterns']['premium_rate']

if pattern and re.match(pattern, '9002345678'):
    print('Premium-rate number')
```

## Data Structure

```json
{
  "version": "2026.03.21",
  "source": "libphonenumber",
  "generated_at": "2026-03-21T00:00:00.000Z",
  "territories": {
    "US": {
      "country_code": "1",
      "main_country_for_code": true,
      "leading_digits": null,
      "number_lengths": [10],
      "local_lengths": [7],
      "patterns": {
        "premium_rate": "^900[2-9]\\d{6}$",
        "toll_free": "^8(?:00|33|...)$",
        "shared_cost": null,
        "mobile": "^...$",
        "fixed_line": "^...$",
        "voip": null,
        "personal_number": "^...$",
        "pager": null,
        "uan": "^...$",
        "voicemail": null
      },
      "example_numbers": {
        "mobile": "2015550123",
        "premium_rate": "9002345678",
        "toll_free": "8002345678"
      }
    }
  },
  "non_geographic": {
    "800": { "country_code": "800", "patterns": { ... } },
    "808": { ... }
  },
  "country_names": {
    "US": "United States",
    "GB": "United Kingdom",
    "CA": "Canada"
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `country_code` | ITU calling code (e.g., `"1"` for US, `"44"` for GB) |
| `main_country_for_code` | `true` if this is the primary territory for a shared calling code |
| `leading_digits` | Regex to disambiguate shared codes (e.g., `"268"` for Antigua under +1) |
| `number_lengths` | Valid national number lengths |
| `local_lengths` | Valid local-only number lengths, or `null` |
| `patterns.*` | Anchored regex patterns per number type, or `null` if not applicable |
| `example_numbers` | Sample numbers per type (for testing/documentation) |

### Number Types

| Key | Description |
|-----|-------------|
| `premium_rate` | Caller pays high per-minute/per-SMS rate |
| `toll_free` | Free for caller |
| `shared_cost` | Cost split between caller and receiver |
| `mobile` | Mobile phone |
| `fixed_line` | Landline |
| `voip` | Internet-based number |
| `personal_number` | Routed to any device |
| `pager` | Pager |
| `uan` | Universal Access Number |
| `voicemail` | Voicemail |

### Non-Geographic Entries

International calling codes not tied to any country (e.g., `800` for international toll-free, `870` for Inmarsat satellite). Stored separately in `non_geographic`, keyed by calling code.

## How Patterns Work

Patterns are **anchored regular expressions** that match the **national (subscriber) number** — the phone number without the country code prefix.

Example for US premium-rate:
- Full number: `+1-900-234-5678`
- Country code: `1`
- Subscriber number: `9002345678`
- Pattern: `^900[2-9]\d{6}$`
- Match: `true` (premium-rate)

## Updates

Data is extracted weekly from the latest [libphonenumber release](https://github.com/google/libphonenumber/releases) (~every 2 weeks) via GitHub Actions. Only metadata changes trigger a new npm publish.

## Building from Source

```bash
# Download the latest XML
npm run download

# Extract to JSON
npm run build

# Or both at once
npm run update
```

## Data Source

Extracted from Google's [PhoneNumberMetadata.xml](https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml) under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

## License

Apache License 2.0 — same as the source data from Google's libphonenumber.
