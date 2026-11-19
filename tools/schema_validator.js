'use strict';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateObject(value, schema, label = 'value') {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: [`${label} must be an object`] };

  for (const [key, rule] of Object.entries(schema || {})) {
    const v = value[key];
    if (rule.required && (v === undefined || v === null || v === '')) {
      errors.push(`${label}.${key} is required`);
      continue;
    }
    if (v === undefined || v === null) continue;
    if (rule.type === 'string' && typeof v !== 'string') errors.push(`${label}.${key} must be a string`);
    if (rule.type === 'number' && typeof v !== 'number') errors.push(`${label}.${key} must be a number`);
    if (rule.type === 'boolean' && typeof v !== 'boolean') errors.push(`${label}.${key} must be a boolean`);
    if (rule.type === 'array' && !Array.isArray(v)) errors.push(`${label}.${key} must be an array`);
    if (rule.type === 'object' && !isObject(v)) errors.push(`${label}.${key} must be an object`);
    if (rule.enum && !rule.enum.includes(v)) errors.push(`${label}.${key} must be one of: ${rule.enum.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const [key, inline] = item.slice(2).split('=');
    result[key] = inline !== undefined ? inline : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  }
  return result;
}

module.exports = { isObject, validateObject, parseArgs };
