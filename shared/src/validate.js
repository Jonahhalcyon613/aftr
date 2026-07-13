// validate.js — tiny, dependency-free parameter validators.
//
// Used by the controller's command registry to fail bad calls fast, before
// they ever hit AE. The JSX layer validates again independently (defense in
// depth) because the WebSocket is a public surface for programmatic clients.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fail(field, msg) {
  throw new ValidationError(`${field} ${msg}`);
}

export const v = {
  requiredString(params, field) {
    const val = params[field];
    if (typeof val !== 'string' || val.length === 0) {
      fail(field, 'must be a non-empty string');
    }
    return val;
  },
  optionalString(params, field, dflt = undefined) {
    const val = params[field];
    if (val === undefined || val === null) return dflt;
    if (typeof val !== 'string') fail(field, 'must be a string');
    return val;
  },
  requiredInt(params, field) {
    const val = params[field];
    if (typeof val !== 'number' || !Number.isInteger(val)) {
      fail(field, 'must be an integer');
    }
    return val;
  },
  optionalPositiveInt(params, field, dflt = undefined) {
    const val = params[field];
    if (val === undefined || val === null) return dflt;
    if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) {
      fail(field, 'must be a positive integer');
    }
    return val;
  },
  requiredPositiveInt(params, field) {
    const val = params[field];
    if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) {
      fail(field, 'must be a positive integer');
    }
    return val;
  },
  optionalPositiveNumber(params, field, dflt = undefined) {
    const val = params[field];
    if (val === undefined || val === null) return dflt;
    if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
      fail(field, 'must be a positive number');
    }
    return val;
  },
  // color: [r,g,b] each 0..1
  optionalColor(params, field, dflt = undefined) {
    const val = params[field];
    if (val === undefined || val === null) return dflt;
    if (!Array.isArray(val) || (val.length !== 3 && val.length !== 4)) {
      fail(field, 'must be an array [r,g,b] with values 0..1');
    }
    for (const c of val) {
      if (typeof c !== 'number' || c < 0 || c > 1) {
        fail(field, 'channels must be numbers in 0..1');
      }
    }
    return val.slice(0, 3);
  },
  // position / point: [x,y] (or [x,y,z])
  optionalPoint(params, field, dflt = undefined) {
    const val = params[field];
    if (val === undefined || val === null) return dflt;
    if (!Array.isArray(val) || val.length < 2 || val.length > 3) {
      fail(field, 'must be an array [x,y] (or [x,y,z]) of numbers');
    }
    for (const n of val) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        fail(field, 'components must be finite numbers');
      }
    }
    return val;
  },
  // value: present, any JSON type
  required(params, field) {
    if (!(field in params) || params[field] === undefined) {
      fail(field, 'is required');
    }
    return params[field];
  },
};
