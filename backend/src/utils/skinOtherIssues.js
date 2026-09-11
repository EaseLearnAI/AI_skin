// Keep free-form observations without inferring a condition, severity or score.
const text = (value) => typeof value === 'string';
const strings = (value) => Array.isArray(value) && value.every(text);
const bool = (value) => typeof value === 'boolean';
const integer = (value) => Number.isInteger(value);
const common = { exists: bool, severity: text, description: text };
const fields = {
  redness: { ...common, distribution: strings },
  hyperpigmentation: { ...common, types: strings, distribution: strings },
  fineLines: { ...common, distribution: strings },
  sensitivity: { ...common, signs: strings },
  skinToneEvenness: { score: integer, description: text }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const details = (value) => strings(value) ? value : [typeof value === 'string' ? value : JSON.stringify(value)];

const normalizeSkinOtherIssues = (value) => {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return { description: value };
  if (Array.isArray(value) && value.length === 0) return {};
  const result = {};
  const observations = [];
  const preserve = (category, raw) => {
    if (raw !== undefined) observations.push({ category, details: details(raw) });
  };
  if (!isObject(value)) {
    preserve('otherIssues', value);
  } else {
    for (const [category, raw] of Object.entries(value)) {
      if (category === 'description' && text(raw)) {
        result.description = raw;
      } else if (category === 'observations' && Array.isArray(raw)) {
        for (const entry of raw) {
          if (isObject(entry) && text(entry.category) && strings(entry.details)
            && Object.keys(entry).every((key) => ['category', 'details'].includes(key))) observations.push(entry);
          else preserve('observations', entry);
        }
      } else if (fields[category] && isObject(raw)) {
        const known = {};
        for (const [key, fieldValue] of Object.entries(raw)) {
          if (fields[category][key]?.(fieldValue)) known[key] = fieldValue;
          else preserve(`${category}.${key}`, fieldValue);
        }
        result[category] = known;
      } else {
        preserve(category, raw);
      }
    }
  }
  if (observations.length) result.observations = observations;
  return result;
};

module.exports = { normalizeSkinOtherIssues };
