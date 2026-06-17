#!/usr/bin/env node
#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name17 in all)
    __defProp(target, name17, { get: all[name17], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/zod/v3/helpers/util.js
var util, objectUtil, ZodParsedType, getParsedType;
var init_util = __esm({
  "node_modules/zod/v3/helpers/util.js"() {
    (function(util2) {
      util2.assertEqual = (_) => {
      };
      function assertIs(_arg) {
      }
      util2.assertIs = assertIs;
      function assertNever(_x) {
        throw new Error();
      }
      util2.assertNever = assertNever;
      util2.arrayToEnum = (items) => {
        const obj = {};
        for (const item of items) {
          obj[item] = item;
        }
        return obj;
      };
      util2.getValidEnumValues = (obj) => {
        const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
        const filtered = {};
        for (const k of validKeys) {
          filtered[k] = obj[k];
        }
        return util2.objectValues(filtered);
      };
      util2.objectValues = (obj) => {
        return util2.objectKeys(obj).map(function(e) {
          return obj[e];
        });
      };
      util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object2) => {
        const keys = [];
        for (const key in object2) {
          if (Object.prototype.hasOwnProperty.call(object2, key)) {
            keys.push(key);
          }
        }
        return keys;
      };
      util2.find = (arr, checker) => {
        for (const item of arr) {
          if (checker(item))
            return item;
        }
        return void 0;
      };
      util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
      function joinValues(array, separator = " | ") {
        return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
      }
      util2.joinValues = joinValues;
      util2.jsonStringifyReplacer = (_, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      };
    })(util || (util = {}));
    (function(objectUtil2) {
      objectUtil2.mergeShapes = (first, second) => {
        return {
          ...first,
          ...second
          // second overwrites first
        };
      };
    })(objectUtil || (objectUtil = {}));
    ZodParsedType = util.arrayToEnum([
      "string",
      "nan",
      "number",
      "integer",
      "float",
      "boolean",
      "date",
      "bigint",
      "symbol",
      "function",
      "undefined",
      "null",
      "array",
      "object",
      "unknown",
      "promise",
      "void",
      "never",
      "map",
      "set"
    ]);
    getParsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "undefined":
          return ZodParsedType.undefined;
        case "string":
          return ZodParsedType.string;
        case "number":
          return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
        case "boolean":
          return ZodParsedType.boolean;
        case "function":
          return ZodParsedType.function;
        case "bigint":
          return ZodParsedType.bigint;
        case "symbol":
          return ZodParsedType.symbol;
        case "object":
          if (Array.isArray(data)) {
            return ZodParsedType.array;
          }
          if (data === null) {
            return ZodParsedType.null;
          }
          if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
            return ZodParsedType.promise;
          }
          if (typeof Map !== "undefined" && data instanceof Map) {
            return ZodParsedType.map;
          }
          if (typeof Set !== "undefined" && data instanceof Set) {
            return ZodParsedType.set;
          }
          if (typeof Date !== "undefined" && data instanceof Date) {
            return ZodParsedType.date;
          }
          return ZodParsedType.object;
        default:
          return ZodParsedType.unknown;
      }
    };
  }
});

// node_modules/zod/v3/ZodError.js
var ZodIssueCode, quotelessJson, ZodError;
var init_ZodError = __esm({
  "node_modules/zod/v3/ZodError.js"() {
    init_util();
    ZodIssueCode = util.arrayToEnum([
      "invalid_type",
      "invalid_literal",
      "custom",
      "invalid_union",
      "invalid_union_discriminator",
      "invalid_enum_value",
      "unrecognized_keys",
      "invalid_arguments",
      "invalid_return_type",
      "invalid_date",
      "invalid_string",
      "too_small",
      "too_big",
      "invalid_intersection_types",
      "not_multiple_of",
      "not_finite"
    ]);
    quotelessJson = (obj) => {
      const json = JSON.stringify(obj, null, 2);
      return json.replace(/"([^"]+)":/g, "$1:");
    };
    ZodError = class _ZodError extends Error {
      get errors() {
        return this.issues;
      }
      constructor(issues) {
        super();
        this.issues = [];
        this.addIssue = (sub) => {
          this.issues = [...this.issues, sub];
        };
        this.addIssues = (subs = []) => {
          this.issues = [...this.issues, ...subs];
        };
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(this, actualProto);
        } else {
          this.__proto__ = actualProto;
        }
        this.name = "ZodError";
        this.issues = issues;
      }
      format(_mapper) {
        const mapper = _mapper || function(issue) {
          return issue.message;
        };
        const fieldErrors = { _errors: [] };
        const processError = (error) => {
          for (const issue of error.issues) {
            if (issue.code === "invalid_union") {
              issue.unionErrors.map(processError);
            } else if (issue.code === "invalid_return_type") {
              processError(issue.returnTypeError);
            } else if (issue.code === "invalid_arguments") {
              processError(issue.argumentsError);
            } else if (issue.path.length === 0) {
              fieldErrors._errors.push(mapper(issue));
            } else {
              let curr = fieldErrors;
              let i = 0;
              while (i < issue.path.length) {
                const el = issue.path[i];
                const terminal = i === issue.path.length - 1;
                if (!terminal) {
                  curr[el] = curr[el] || { _errors: [] };
                } else {
                  curr[el] = curr[el] || { _errors: [] };
                  curr[el]._errors.push(mapper(issue));
                }
                curr = curr[el];
                i++;
              }
            }
          }
        };
        processError(this);
        return fieldErrors;
      }
      static assert(value) {
        if (!(value instanceof _ZodError)) {
          throw new Error(`Not a ZodError: ${value}`);
        }
      }
      toString() {
        return this.message;
      }
      get message() {
        return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
      }
      get isEmpty() {
        return this.issues.length === 0;
      }
      flatten(mapper = (issue) => issue.message) {
        const fieldErrors = {};
        const formErrors = [];
        for (const sub of this.issues) {
          if (sub.path.length > 0) {
            const firstEl = sub.path[0];
            fieldErrors[firstEl] = fieldErrors[firstEl] || [];
            fieldErrors[firstEl].push(mapper(sub));
          } else {
            formErrors.push(mapper(sub));
          }
        }
        return { formErrors, fieldErrors };
      }
      get formErrors() {
        return this.flatten();
      }
    };
    ZodError.create = (issues) => {
      const error = new ZodError(issues);
      return error;
    };
  }
});

// node_modules/zod/v3/locales/en.js
var errorMap, en_default;
var init_en = __esm({
  "node_modules/zod/v3/locales/en.js"() {
    init_ZodError();
    init_util();
    errorMap = (issue, _ctx) => {
      let message;
      switch (issue.code) {
        case ZodIssueCode.invalid_type:
          if (issue.received === ZodParsedType.undefined) {
            message = "Required";
          } else {
            message = `Expected ${issue.expected}, received ${issue.received}`;
          }
          break;
        case ZodIssueCode.invalid_literal:
          message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
          break;
        case ZodIssueCode.unrecognized_keys:
          message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
          break;
        case ZodIssueCode.invalid_union:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_union_discriminator:
          message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
          break;
        case ZodIssueCode.invalid_enum_value:
          message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
          break;
        case ZodIssueCode.invalid_arguments:
          message = `Invalid function arguments`;
          break;
        case ZodIssueCode.invalid_return_type:
          message = `Invalid function return type`;
          break;
        case ZodIssueCode.invalid_date:
          message = `Invalid date`;
          break;
        case ZodIssueCode.invalid_string:
          if (typeof issue.validation === "object") {
            if ("includes" in issue.validation) {
              message = `Invalid input: must include "${issue.validation.includes}"`;
              if (typeof issue.validation.position === "number") {
                message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
              }
            } else if ("startsWith" in issue.validation) {
              message = `Invalid input: must start with "${issue.validation.startsWith}"`;
            } else if ("endsWith" in issue.validation) {
              message = `Invalid input: must end with "${issue.validation.endsWith}"`;
            } else {
              util.assertNever(issue.validation);
            }
          } else if (issue.validation !== "regex") {
            message = `Invalid ${issue.validation}`;
          } else {
            message = "Invalid";
          }
          break;
        case ZodIssueCode.too_small:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "bigint")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.too_big:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "bigint")
            message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.custom:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_intersection_types:
          message = `Intersection results could not be merged`;
          break;
        case ZodIssueCode.not_multiple_of:
          message = `Number must be a multiple of ${issue.multipleOf}`;
          break;
        case ZodIssueCode.not_finite:
          message = "Number must be finite";
          break;
        default:
          message = _ctx.defaultError;
          util.assertNever(issue);
      }
      return { message };
    };
    en_default = errorMap;
  }
});

// node_modules/zod/v3/errors.js
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var overrideErrorMap;
var init_errors = __esm({
  "node_modules/zod/v3/errors.js"() {
    init_en();
    overrideErrorMap = en_default;
  }
});

// node_modules/zod/v3/helpers/parseUtil.js
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var makeIssue, EMPTY_PATH, ParseStatus, INVALID, DIRTY, OK, isAborted, isDirty, isValid, isAsync;
var init_parseUtil = __esm({
  "node_modules/zod/v3/helpers/parseUtil.js"() {
    init_errors();
    init_en();
    makeIssue = (params) => {
      const { data, path, errorMaps, issueData } = params;
      const fullPath = [...path, ...issueData.path || []];
      const fullIssue = {
        ...issueData,
        path: fullPath
      };
      if (issueData.message !== void 0) {
        return {
          ...issueData,
          path: fullPath,
          message: issueData.message
        };
      }
      let errorMessage = "";
      const maps = errorMaps.filter((m) => !!m).slice().reverse();
      for (const map of maps) {
        errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
      }
      return {
        ...issueData,
        path: fullPath,
        message: errorMessage
      };
    };
    EMPTY_PATH = [];
    ParseStatus = class _ParseStatus {
      constructor() {
        this.value = "valid";
      }
      dirty() {
        if (this.value === "valid")
          this.value = "dirty";
      }
      abort() {
        if (this.value !== "aborted")
          this.value = "aborted";
      }
      static mergeArray(status, results) {
        const arrayValue = [];
        for (const s of results) {
          if (s.status === "aborted")
            return INVALID;
          if (s.status === "dirty")
            status.dirty();
          arrayValue.push(s.value);
        }
        return { status: status.value, value: arrayValue };
      }
      static async mergeObjectAsync(status, pairs) {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value
          });
        }
        return _ParseStatus.mergeObjectSync(status, syncPairs);
      }
      static mergeObjectSync(status, pairs) {
        const finalObject = {};
        for (const pair of pairs) {
          const { key, value } = pair;
          if (key.status === "aborted")
            return INVALID;
          if (value.status === "aborted")
            return INVALID;
          if (key.status === "dirty")
            status.dirty();
          if (value.status === "dirty")
            status.dirty();
          if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
            finalObject[key.value] = value.value;
          }
        }
        return { status: status.value, value: finalObject };
      }
    };
    INVALID = Object.freeze({
      status: "aborted"
    });
    DIRTY = (value) => ({ status: "dirty", value });
    OK = (value) => ({ status: "valid", value });
    isAborted = (x) => x.status === "aborted";
    isDirty = (x) => x.status === "dirty";
    isValid = (x) => x.status === "valid";
    isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
  }
});

// node_modules/zod/v3/helpers/typeAliases.js
var init_typeAliases = __esm({
  "node_modules/zod/v3/helpers/typeAliases.js"() {
  }
});

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
var init_errorUtil = __esm({
  "node_modules/zod/v3/helpers/errorUtil.js"() {
    (function(errorUtil2) {
      errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
      errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
    })(errorUtil || (errorUtil = {}));
  }
});

// node_modules/zod/v3/types.js
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var ParseInputLazyPath, handleResult, ZodType, cuidRegex, cuid2Regex, ulidRegex, uuidRegex, nanoidRegex, jwtRegex, durationRegex, emailRegex, _emojiRegex, emojiRegex, ipv4Regex, ipv4CidrRegex, ipv6Regex, ipv6CidrRegex, base64Regex, base64urlRegex, dateRegexSource, dateRegex, ZodString, ZodNumber, ZodBigInt, ZodBoolean, ZodDate, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodArray, ZodObject, ZodUnion, getDiscriminator, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodFunction, ZodLazy, ZodLiteral, ZodEnum, ZodNativeEnum, ZodPromise, ZodEffects, ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodNaN, BRAND, ZodBranded, ZodPipeline, ZodReadonly, late, ZodFirstPartyTypeKind, instanceOfType, stringType, numberType, nanType, bigIntType, booleanType, dateType, symbolType, undefinedType, nullType, anyType, unknownType, neverType, voidType, arrayType, objectType, strictObjectType, unionType, discriminatedUnionType, intersectionType, tupleType, recordType, mapType, setType, functionType, lazyType, literalType, enumType, nativeEnumType, promiseType, effectsType, optionalType, nullableType, preprocessType, pipelineType, ostring, onumber, oboolean, coerce, NEVER;
var init_types = __esm({
  "node_modules/zod/v3/types.js"() {
    init_ZodError();
    init_errors();
    init_errorUtil();
    init_parseUtil();
    init_util();
    ParseInputLazyPath = class {
      constructor(parent, value, path, key) {
        this._cachedPath = [];
        this.parent = parent;
        this.data = value;
        this._path = path;
        this._key = key;
      }
      get path() {
        if (!this._cachedPath.length) {
          if (Array.isArray(this._key)) {
            this._cachedPath.push(...this._path, ...this._key);
          } else {
            this._cachedPath.push(...this._path, this._key);
          }
        }
        return this._cachedPath;
      }
    };
    handleResult = (ctx, result) => {
      if (isValid(result)) {
        return { success: true, data: result.value };
      } else {
        if (!ctx.common.issues.length) {
          throw new Error("Validation failed but no issues detected.");
        }
        return {
          success: false,
          get error() {
            if (this._error)
              return this._error;
            const error = new ZodError(ctx.common.issues);
            this._error = error;
            return this._error;
          }
        };
      }
    };
    ZodType = class {
      get description() {
        return this._def.description;
      }
      _getType(input) {
        return getParsedType(input.data);
      }
      _getOrReturnCtx(input, ctx) {
        return ctx || {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        };
      }
      _processInputParams(input) {
        return {
          status: new ParseStatus(),
          ctx: {
            common: input.parent.common,
            data: input.data,
            parsedType: getParsedType(input.data),
            schemaErrorMap: this._def.errorMap,
            path: input.path,
            parent: input.parent
          }
        };
      }
      _parseSync(input) {
        const result = this._parse(input);
        if (isAsync(result)) {
          throw new Error("Synchronous parse encountered promise.");
        }
        return result;
      }
      _parseAsync(input) {
        const result = this._parse(input);
        return Promise.resolve(result);
      }
      parse(data, params) {
        const result = this.safeParse(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      safeParse(data, params) {
        const ctx = {
          common: {
            issues: [],
            async: params?.async ?? false,
            contextualErrorMap: params?.errorMap
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const result = this._parseSync({ data, path: ctx.path, parent: ctx });
        return handleResult(ctx, result);
      }
      "~validate"(data) {
        const ctx = {
          common: {
            issues: [],
            async: !!this["~standard"].async
          },
          path: [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        if (!this["~standard"].async) {
          try {
            const result = this._parseSync({ data, path: [], parent: ctx });
            return isValid(result) ? {
              value: result.value
            } : {
              issues: ctx.common.issues
            };
          } catch (err) {
            if (err?.message?.toLowerCase()?.includes("encountered")) {
              this["~standard"].async = true;
            }
            ctx.common = {
              issues: [],
              async: true
            };
          }
        }
        return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        });
      }
      async parseAsync(data, params) {
        const result = await this.safeParseAsync(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      async safeParseAsync(data, params) {
        const ctx = {
          common: {
            issues: [],
            contextualErrorMap: params?.errorMap,
            async: true
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
        const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
        return handleResult(ctx, result);
      }
      refine(check, message) {
        const getIssueProperties = (val) => {
          if (typeof message === "string" || typeof message === "undefined") {
            return { message };
          } else if (typeof message === "function") {
            return message(val);
          } else {
            return message;
          }
        };
        return this._refinement((val, ctx) => {
          const result = check(val);
          const setError = () => ctx.addIssue({
            code: ZodIssueCode.custom,
            ...getIssueProperties(val)
          });
          if (typeof Promise !== "undefined" && result instanceof Promise) {
            return result.then((data) => {
              if (!data) {
                setError();
                return false;
              } else {
                return true;
              }
            });
          }
          if (!result) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      refinement(check, refinementData) {
        return this._refinement((val, ctx) => {
          if (!check(val)) {
            ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
            return false;
          } else {
            return true;
          }
        });
      }
      _refinement(refinement) {
        return new ZodEffects({
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "refinement", refinement }
        });
      }
      superRefine(refinement) {
        return this._refinement(refinement);
      }
      constructor(def) {
        this.spa = this.safeParseAsync;
        this._def = def;
        this.parse = this.parse.bind(this);
        this.safeParse = this.safeParse.bind(this);
        this.parseAsync = this.parseAsync.bind(this);
        this.safeParseAsync = this.safeParseAsync.bind(this);
        this.spa = this.spa.bind(this);
        this.refine = this.refine.bind(this);
        this.refinement = this.refinement.bind(this);
        this.superRefine = this.superRefine.bind(this);
        this.optional = this.optional.bind(this);
        this.nullable = this.nullable.bind(this);
        this.nullish = this.nullish.bind(this);
        this.array = this.array.bind(this);
        this.promise = this.promise.bind(this);
        this.or = this.or.bind(this);
        this.and = this.and.bind(this);
        this.transform = this.transform.bind(this);
        this.brand = this.brand.bind(this);
        this.default = this.default.bind(this);
        this.catch = this.catch.bind(this);
        this.describe = this.describe.bind(this);
        this.pipe = this.pipe.bind(this);
        this.readonly = this.readonly.bind(this);
        this.isNullable = this.isNullable.bind(this);
        this.isOptional = this.isOptional.bind(this);
        this["~standard"] = {
          version: 1,
          vendor: "zod",
          validate: (data) => this["~validate"](data)
        };
      }
      optional() {
        return ZodOptional.create(this, this._def);
      }
      nullable() {
        return ZodNullable.create(this, this._def);
      }
      nullish() {
        return this.nullable().optional();
      }
      array() {
        return ZodArray.create(this);
      }
      promise() {
        return ZodPromise.create(this, this._def);
      }
      or(option) {
        return ZodUnion.create([this, option], this._def);
      }
      and(incoming) {
        return ZodIntersection.create(this, incoming, this._def);
      }
      transform(transform) {
        return new ZodEffects({
          ...processCreateParams(this._def),
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "transform", transform }
        });
      }
      default(def) {
        const defaultValueFunc = typeof def === "function" ? def : () => def;
        return new ZodDefault({
          ...processCreateParams(this._def),
          innerType: this,
          defaultValue: defaultValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodDefault
        });
      }
      brand() {
        return new ZodBranded({
          typeName: ZodFirstPartyTypeKind.ZodBranded,
          type: this,
          ...processCreateParams(this._def)
        });
      }
      catch(def) {
        const catchValueFunc = typeof def === "function" ? def : () => def;
        return new ZodCatch({
          ...processCreateParams(this._def),
          innerType: this,
          catchValue: catchValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodCatch
        });
      }
      describe(description) {
        const This = this.constructor;
        return new This({
          ...this._def,
          description
        });
      }
      pipe(target) {
        return ZodPipeline.create(this, target);
      }
      readonly() {
        return ZodReadonly.create(this);
      }
      isOptional() {
        return this.safeParse(void 0).success;
      }
      isNullable() {
        return this.safeParse(null).success;
      }
    };
    cuidRegex = /^c[^\s-]{8,}$/i;
    cuid2Regex = /^[0-9a-z]+$/;
    ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
    uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    nanoidRegex = /^[a-z0-9_-]{21}$/i;
    jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
    emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
    _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
    ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
    ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
    dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
    dateRegex = new RegExp(`^${dateRegexSource}$`);
    ZodString = class _ZodString extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = String(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.string) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.string,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.length < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.length > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "length") {
            const tooBig = input.data.length > check.value;
            const tooSmall = input.data.length < check.value;
            if (tooBig || tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              if (tooBig) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_big,
                  maximum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              } else if (tooSmall) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_small,
                  minimum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              }
              status.dirty();
            }
          } else if (check.kind === "email") {
            if (!emailRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "email",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "emoji") {
            if (!emojiRegex) {
              emojiRegex = new RegExp(_emojiRegex, "u");
            }
            if (!emojiRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "emoji",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "uuid") {
            if (!uuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "uuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "nanoid") {
            if (!nanoidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "nanoid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid") {
            if (!cuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid2") {
            if (!cuid2Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid2",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ulid") {
            if (!ulidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ulid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "url") {
            try {
              new URL(input.data);
            } catch {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "regex") {
            check.regex.lastIndex = 0;
            const testResult = check.regex.test(input.data);
            if (!testResult) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "regex",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "trim") {
            input.data = input.data.trim();
          } else if (check.kind === "includes") {
            if (!input.data.includes(check.value, check.position)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { includes: check.value, position: check.position },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "toLowerCase") {
            input.data = input.data.toLowerCase();
          } else if (check.kind === "toUpperCase") {
            input.data = input.data.toUpperCase();
          } else if (check.kind === "startsWith") {
            if (!input.data.startsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { startsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "endsWith") {
            if (!input.data.endsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { endsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "datetime") {
            const regex = datetimeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "datetime",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "date") {
            const regex = dateRegex;
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "date",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "time") {
            const regex = timeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "time",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "duration") {
            if (!durationRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "duration",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ip") {
            if (!isValidIP(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ip",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "jwt") {
            if (!isValidJWT(input.data, check.alg)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "jwt",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cidr") {
            if (!isValidCidr(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cidr",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64") {
            if (!base64Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64url") {
            if (!base64urlRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _regex(regex, validation, message) {
        return this.refinement((data) => regex.test(data), {
          validation,
          code: ZodIssueCode.invalid_string,
          ...errorUtil.errToObj(message)
        });
      }
      _addCheck(check) {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      email(message) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
      }
      url(message) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
      }
      emoji(message) {
        return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
      }
      uuid(message) {
        return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
      }
      nanoid(message) {
        return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
      }
      cuid(message) {
        return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
      }
      cuid2(message) {
        return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
      }
      ulid(message) {
        return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
      }
      base64(message) {
        return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
      }
      base64url(message) {
        return this._addCheck({
          kind: "base64url",
          ...errorUtil.errToObj(message)
        });
      }
      jwt(options) {
        return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
      }
      ip(options) {
        return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
      }
      cidr(options) {
        return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
      }
      datetime(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "datetime",
            precision: null,
            offset: false,
            local: false,
            message: options
          });
        }
        return this._addCheck({
          kind: "datetime",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          offset: options?.offset ?? false,
          local: options?.local ?? false,
          ...errorUtil.errToObj(options?.message)
        });
      }
      date(message) {
        return this._addCheck({ kind: "date", message });
      }
      time(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "time",
            precision: null,
            message: options
          });
        }
        return this._addCheck({
          kind: "time",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          ...errorUtil.errToObj(options?.message)
        });
      }
      duration(message) {
        return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
      }
      regex(regex, message) {
        return this._addCheck({
          kind: "regex",
          regex,
          ...errorUtil.errToObj(message)
        });
      }
      includes(value, options) {
        return this._addCheck({
          kind: "includes",
          value,
          position: options?.position,
          ...errorUtil.errToObj(options?.message)
        });
      }
      startsWith(value, message) {
        return this._addCheck({
          kind: "startsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      endsWith(value, message) {
        return this._addCheck({
          kind: "endsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      min(minLength, message) {
        return this._addCheck({
          kind: "min",
          value: minLength,
          ...errorUtil.errToObj(message)
        });
      }
      max(maxLength, message) {
        return this._addCheck({
          kind: "max",
          value: maxLength,
          ...errorUtil.errToObj(message)
        });
      }
      length(len, message) {
        return this._addCheck({
          kind: "length",
          value: len,
          ...errorUtil.errToObj(message)
        });
      }
      /**
       * Equivalent to `.min(1)`
       */
      nonempty(message) {
        return this.min(1, errorUtil.errToObj(message));
      }
      trim() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "trim" }]
        });
      }
      toLowerCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toLowerCase" }]
        });
      }
      toUpperCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toUpperCase" }]
        });
      }
      get isDatetime() {
        return !!this._def.checks.find((ch) => ch.kind === "datetime");
      }
      get isDate() {
        return !!this._def.checks.find((ch) => ch.kind === "date");
      }
      get isTime() {
        return !!this._def.checks.find((ch) => ch.kind === "time");
      }
      get isDuration() {
        return !!this._def.checks.find((ch) => ch.kind === "duration");
      }
      get isEmail() {
        return !!this._def.checks.find((ch) => ch.kind === "email");
      }
      get isURL() {
        return !!this._def.checks.find((ch) => ch.kind === "url");
      }
      get isEmoji() {
        return !!this._def.checks.find((ch) => ch.kind === "emoji");
      }
      get isUUID() {
        return !!this._def.checks.find((ch) => ch.kind === "uuid");
      }
      get isNANOID() {
        return !!this._def.checks.find((ch) => ch.kind === "nanoid");
      }
      get isCUID() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid");
      }
      get isCUID2() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid2");
      }
      get isULID() {
        return !!this._def.checks.find((ch) => ch.kind === "ulid");
      }
      get isIP() {
        return !!this._def.checks.find((ch) => ch.kind === "ip");
      }
      get isCIDR() {
        return !!this._def.checks.find((ch) => ch.kind === "cidr");
      }
      get isBase64() {
        return !!this._def.checks.find((ch) => ch.kind === "base64");
      }
      get isBase64url() {
        return !!this._def.checks.find((ch) => ch.kind === "base64url");
      }
      get minLength() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxLength() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodString.create = (params) => {
      return new ZodString({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodString,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodNumber = class _ZodNumber extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
        this.step = this.multipleOf;
      }
      _parse(input) {
        if (this._def.coerce) {
          input.data = Number(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.number) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.number,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "int") {
            if (!util.isInteger(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: "integer",
                received: "float",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (floatSafeRemainder(input.data, check.value) !== 0) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "finite") {
            if (!Number.isFinite(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_finite,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodNumber({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodNumber({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      int(message) {
        return this._addCheck({
          kind: "int",
          message: errorUtil.toString(message)
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      finite(message) {
        return this._addCheck({
          kind: "finite",
          message: errorUtil.toString(message)
        });
      }
      safe(message) {
        return this._addCheck({
          kind: "min",
          inclusive: true,
          value: Number.MIN_SAFE_INTEGER,
          message: errorUtil.toString(message)
        })._addCheck({
          kind: "max",
          inclusive: true,
          value: Number.MAX_SAFE_INTEGER,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
      get isInt() {
        return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
      }
      get isFinite() {
        let max = null;
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
            return true;
          } else if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          } else if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return Number.isFinite(min) && Number.isFinite(max);
      }
    };
    ZodNumber.create = (params) => {
      return new ZodNumber({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodNumber,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodBigInt = class _ZodBigInt extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
      }
      _parse(input) {
        if (this._def.coerce) {
          try {
            input.data = BigInt(input.data);
          } catch {
            return this._getInvalidInput(input);
          }
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.bigint) {
          return this._getInvalidInput(input);
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                type: "bigint",
                minimum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                type: "bigint",
                maximum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (input.data % check.value !== BigInt(0)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _getInvalidInput(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.bigint,
          received: ctx.parsedType
        });
        return INVALID;
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodBigInt({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodBigInt({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodBigInt.create = (params) => {
      return new ZodBigInt({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodBigInt,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodBoolean = class extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = Boolean(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.boolean) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.boolean,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodBoolean.create = (params) => {
      return new ZodBoolean({
        typeName: ZodFirstPartyTypeKind.ZodBoolean,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodDate = class _ZodDate extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = new Date(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.date) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.date,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        if (Number.isNaN(input.data.getTime())) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_date
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.getTime() < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                message: check.message,
                inclusive: true,
                exact: false,
                minimum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.getTime() > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                message: check.message,
                inclusive: true,
                exact: false,
                maximum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return {
          status: status.value,
          value: new Date(input.data.getTime())
        };
      }
      _addCheck(check) {
        return new _ZodDate({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      min(minDate, message) {
        return this._addCheck({
          kind: "min",
          value: minDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      max(maxDate, message) {
        return this._addCheck({
          kind: "max",
          value: maxDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      get minDate() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min != null ? new Date(min) : null;
      }
      get maxDate() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max != null ? new Date(max) : null;
      }
    };
    ZodDate.create = (params) => {
      return new ZodDate({
        checks: [],
        coerce: params?.coerce || false,
        typeName: ZodFirstPartyTypeKind.ZodDate,
        ...processCreateParams(params)
      });
    };
    ZodSymbol = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.symbol) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.symbol,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodSymbol.create = (params) => {
      return new ZodSymbol({
        typeName: ZodFirstPartyTypeKind.ZodSymbol,
        ...processCreateParams(params)
      });
    };
    ZodUndefined = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.undefined,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodUndefined.create = (params) => {
      return new ZodUndefined({
        typeName: ZodFirstPartyTypeKind.ZodUndefined,
        ...processCreateParams(params)
      });
    };
    ZodNull = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.null) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.null,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodNull.create = (params) => {
      return new ZodNull({
        typeName: ZodFirstPartyTypeKind.ZodNull,
        ...processCreateParams(params)
      });
    };
    ZodAny = class extends ZodType {
      constructor() {
        super(...arguments);
        this._any = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodAny.create = (params) => {
      return new ZodAny({
        typeName: ZodFirstPartyTypeKind.ZodAny,
        ...processCreateParams(params)
      });
    };
    ZodUnknown = class extends ZodType {
      constructor() {
        super(...arguments);
        this._unknown = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodUnknown.create = (params) => {
      return new ZodUnknown({
        typeName: ZodFirstPartyTypeKind.ZodUnknown,
        ...processCreateParams(params)
      });
    };
    ZodNever = class extends ZodType {
      _parse(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.never,
          received: ctx.parsedType
        });
        return INVALID;
      }
    };
    ZodNever.create = (params) => {
      return new ZodNever({
        typeName: ZodFirstPartyTypeKind.ZodNever,
        ...processCreateParams(params)
      });
    };
    ZodVoid = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.void,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodVoid.create = (params) => {
      return new ZodVoid({
        typeName: ZodFirstPartyTypeKind.ZodVoid,
        ...processCreateParams(params)
      });
    };
    ZodArray = class _ZodArray extends ZodType {
      _parse(input) {
        const { ctx, status } = this._processInputParams(input);
        const def = this._def;
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (def.exactLength !== null) {
          const tooBig = ctx.data.length > def.exactLength.value;
          const tooSmall = ctx.data.length < def.exactLength.value;
          if (tooBig || tooSmall) {
            addIssueToContext(ctx, {
              code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
              minimum: tooSmall ? def.exactLength.value : void 0,
              maximum: tooBig ? def.exactLength.value : void 0,
              type: "array",
              inclusive: true,
              exact: true,
              message: def.exactLength.message
            });
            status.dirty();
          }
        }
        if (def.minLength !== null) {
          if (ctx.data.length < def.minLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.minLength.message
            });
            status.dirty();
          }
        }
        if (def.maxLength !== null) {
          if (ctx.data.length > def.maxLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.maxLength.message
            });
            status.dirty();
          }
        }
        if (ctx.common.async) {
          return Promise.all([...ctx.data].map((item, i) => {
            return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
          })).then((result2) => {
            return ParseStatus.mergeArray(status, result2);
          });
        }
        const result = [...ctx.data].map((item, i) => {
          return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        });
        return ParseStatus.mergeArray(status, result);
      }
      get element() {
        return this._def.type;
      }
      min(minLength, message) {
        return new _ZodArray({
          ...this._def,
          minLength: { value: minLength, message: errorUtil.toString(message) }
        });
      }
      max(maxLength, message) {
        return new _ZodArray({
          ...this._def,
          maxLength: { value: maxLength, message: errorUtil.toString(message) }
        });
      }
      length(len, message) {
        return new _ZodArray({
          ...this._def,
          exactLength: { value: len, message: errorUtil.toString(message) }
        });
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodArray.create = (schema, params) => {
      return new ZodArray({
        type: schema,
        minLength: null,
        maxLength: null,
        exactLength: null,
        typeName: ZodFirstPartyTypeKind.ZodArray,
        ...processCreateParams(params)
      });
    };
    ZodObject = class _ZodObject extends ZodType {
      constructor() {
        super(...arguments);
        this._cached = null;
        this.nonstrict = this.passthrough;
        this.augment = this.extend;
      }
      _getCached() {
        if (this._cached !== null)
          return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        this._cached = { shape, keys };
        return this._cached;
      }
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.object) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const { status, ctx } = this._processInputParams(input);
        const { shape, keys: shapeKeys } = this._getCached();
        const extraKeys = [];
        if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
          for (const key in ctx.data) {
            if (!shapeKeys.includes(key)) {
              extraKeys.push(key);
            }
          }
        }
        const pairs = [];
        for (const key of shapeKeys) {
          const keyValidator = shape[key];
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (this._def.catchall instanceof ZodNever) {
          const unknownKeys = this._def.unknownKeys;
          if (unknownKeys === "passthrough") {
            for (const key of extraKeys) {
              pairs.push({
                key: { status: "valid", value: key },
                value: { status: "valid", value: ctx.data[key] }
              });
            }
          } else if (unknownKeys === "strict") {
            if (extraKeys.length > 0) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.unrecognized_keys,
                keys: extraKeys
              });
              status.dirty();
            }
          } else if (unknownKeys === "strip") {
          } else {
            throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
          }
        } else {
          const catchall = this._def.catchall;
          for (const key of extraKeys) {
            const value = ctx.data[key];
            pairs.push({
              key: { status: "valid", value: key },
              value: catchall._parse(
                new ParseInputLazyPath(ctx, value, ctx.path, key)
                //, ctx.child(key), value, getParsedType(value)
              ),
              alwaysSet: key in ctx.data
            });
          }
        }
        if (ctx.common.async) {
          return Promise.resolve().then(async () => {
            const syncPairs = [];
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              syncPairs.push({
                key,
                value,
                alwaysSet: pair.alwaysSet
              });
            }
            return syncPairs;
          }).then((syncPairs) => {
            return ParseStatus.mergeObjectSync(status, syncPairs);
          });
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get shape() {
        return this._def.shape();
      }
      strict(message) {
        errorUtil.errToObj;
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strict",
          ...message !== void 0 ? {
            errorMap: (issue, ctx) => {
              const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
              if (issue.code === "unrecognized_keys")
                return {
                  message: errorUtil.errToObj(message).message ?? defaultError
                };
              return {
                message: defaultError
              };
            }
          } : {}
        });
      }
      strip() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strip"
        });
      }
      passthrough() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "passthrough"
        });
      }
      // const AugmentFactory =
      //   <Def extends ZodObjectDef>(def: Def) =>
      //   <Augmentation extends ZodRawShape>(
      //     augmentation: Augmentation
      //   ): ZodObject<
      //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
      //     Def["unknownKeys"],
      //     Def["catchall"]
      //   > => {
      //     return new ZodObject({
      //       ...def,
      //       shape: () => ({
      //         ...def.shape(),
      //         ...augmentation,
      //       }),
      //     }) as any;
      //   };
      extend(augmentation) {
        return new _ZodObject({
          ...this._def,
          shape: () => ({
            ...this._def.shape(),
            ...augmentation
          })
        });
      }
      /**
       * Prior to zod@1.0.12 there was a bug in the
       * inferred type of merged objects. Please
       * upgrade if you are experiencing issues.
       */
      merge(merging) {
        const merged = new _ZodObject({
          unknownKeys: merging._def.unknownKeys,
          catchall: merging._def.catchall,
          shape: () => ({
            ...this._def.shape(),
            ...merging._def.shape()
          }),
          typeName: ZodFirstPartyTypeKind.ZodObject
        });
        return merged;
      }
      // merge<
      //   Incoming extends AnyZodObject,
      //   Augmentation extends Incoming["shape"],
      //   NewOutput extends {
      //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
      //       ? Augmentation[k]["_output"]
      //       : k extends keyof Output
      //       ? Output[k]
      //       : never;
      //   },
      //   NewInput extends {
      //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
      //       ? Augmentation[k]["_input"]
      //       : k extends keyof Input
      //       ? Input[k]
      //       : never;
      //   }
      // >(
      //   merging: Incoming
      // ): ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"],
      //   NewOutput,
      //   NewInput
      // > {
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      setKey(key, schema) {
        return this.augment({ [key]: schema });
      }
      // merge<Incoming extends AnyZodObject>(
      //   merging: Incoming
      // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
      // ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"]
      // > {
      //   // const mergedShape = objectUtil.mergeShapes(
      //   //   this._def.shape(),
      //   //   merging._def.shape()
      //   // );
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      catchall(index) {
        return new _ZodObject({
          ...this._def,
          catchall: index
        });
      }
      pick(mask) {
        const shape = {};
        for (const key of util.objectKeys(mask)) {
          if (mask[key] && this.shape[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      omit(mask) {
        const shape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (!mask[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      /**
       * @deprecated
       */
      deepPartial() {
        return deepPartialify(this);
      }
      partial(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          const fieldSchema = this.shape[key];
          if (mask && !mask[key]) {
            newShape[key] = fieldSchema;
          } else {
            newShape[key] = fieldSchema.optional();
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      required(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (mask && !mask[key]) {
            newShape[key] = this.shape[key];
          } else {
            const fieldSchema = this.shape[key];
            let newField = fieldSchema;
            while (newField instanceof ZodOptional) {
              newField = newField._def.innerType;
            }
            newShape[key] = newField;
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      keyof() {
        return createZodEnum(util.objectKeys(this.shape));
      }
    };
    ZodObject.create = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.strictCreate = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strict",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.lazycreate = (shape, params) => {
      return new ZodObject({
        shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodUnion = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const options = this._def.options;
        function handleResults(results) {
          for (const result of results) {
            if (result.result.status === "valid") {
              return result.result;
            }
          }
          for (const result of results) {
            if (result.result.status === "dirty") {
              ctx.common.issues.push(...result.ctx.common.issues);
              return result.result;
            }
          }
          const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return Promise.all(options.map(async (option) => {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            return {
              result: await option._parseAsync({
                data: ctx.data,
                path: ctx.path,
                parent: childCtx
              }),
              ctx: childCtx
            };
          })).then(handleResults);
        } else {
          let dirty = void 0;
          const issues = [];
          for (const option of options) {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            const result = option._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            });
            if (result.status === "valid") {
              return result;
            } else if (result.status === "dirty" && !dirty) {
              dirty = { result, ctx: childCtx };
            }
            if (childCtx.common.issues.length) {
              issues.push(childCtx.common.issues);
            }
          }
          if (dirty) {
            ctx.common.issues.push(...dirty.ctx.common.issues);
            return dirty.result;
          }
          const unionErrors = issues.map((issues2) => new ZodError(issues2));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
      }
      get options() {
        return this._def.options;
      }
    };
    ZodUnion.create = (types, params) => {
      return new ZodUnion({
        options: types,
        typeName: ZodFirstPartyTypeKind.ZodUnion,
        ...processCreateParams(params)
      });
    };
    getDiscriminator = (type) => {
      if (type instanceof ZodLazy) {
        return getDiscriminator(type.schema);
      } else if (type instanceof ZodEffects) {
        return getDiscriminator(type.innerType());
      } else if (type instanceof ZodLiteral) {
        return [type.value];
      } else if (type instanceof ZodEnum) {
        return type.options;
      } else if (type instanceof ZodNativeEnum) {
        return util.objectValues(type.enum);
      } else if (type instanceof ZodDefault) {
        return getDiscriminator(type._def.innerType);
      } else if (type instanceof ZodUndefined) {
        return [void 0];
      } else if (type instanceof ZodNull) {
        return [null];
      } else if (type instanceof ZodOptional) {
        return [void 0, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodNullable) {
        return [null, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodBranded) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodReadonly) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodCatch) {
        return getDiscriminator(type._def.innerType);
      } else {
        return [];
      }
    };
    ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const discriminator = this.discriminator;
        const discriminatorValue = ctx.data[discriminator];
        const option = this.optionsMap.get(discriminatorValue);
        if (!option) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union_discriminator,
            options: Array.from(this.optionsMap.keys()),
            path: [discriminator]
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        } else {
          return option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        }
      }
      get discriminator() {
        return this._def.discriminator;
      }
      get options() {
        return this._def.options;
      }
      get optionsMap() {
        return this._def.optionsMap;
      }
      /**
       * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
       * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
       * have a different value for each object in the union.
       * @param discriminator the name of the discriminator property
       * @param types an array of object schemas
       * @param params
       */
      static create(discriminator, options, params) {
        const optionsMap = /* @__PURE__ */ new Map();
        for (const type of options) {
          const discriminatorValues = getDiscriminator(type.shape[discriminator]);
          if (!discriminatorValues.length) {
            throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
          }
          for (const value of discriminatorValues) {
            if (optionsMap.has(value)) {
              throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
            }
            optionsMap.set(value, type);
          }
        }
        return new _ZodDiscriminatedUnion({
          typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
          discriminator,
          options,
          optionsMap,
          ...processCreateParams(params)
        });
      }
    };
    ZodIntersection = class extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const handleParsed = (parsedLeft, parsedRight) => {
          if (isAborted(parsedLeft) || isAborted(parsedRight)) {
            return INVALID;
          }
          const merged = mergeValues(parsedLeft.value, parsedRight.value);
          if (!merged.valid) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_intersection_types
            });
            return INVALID;
          }
          if (isDirty(parsedLeft) || isDirty(parsedRight)) {
            status.dirty();
          }
          return { status: status.value, value: merged.data };
        };
        if (ctx.common.async) {
          return Promise.all([
            this._def.left._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            }),
            this._def.right._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            })
          ]).then(([left, right]) => handleParsed(left, right));
        } else {
          return handleParsed(this._def.left._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }), this._def.right._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }));
        }
      }
    };
    ZodIntersection.create = (left, right, params) => {
      return new ZodIntersection({
        left,
        right,
        typeName: ZodFirstPartyTypeKind.ZodIntersection,
        ...processCreateParams(params)
      });
    };
    ZodTuple = class _ZodTuple extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (ctx.data.length < this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          return INVALID;
        }
        const rest = this._def.rest;
        if (!rest && ctx.data.length > this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          status.dirty();
        }
        const items = [...ctx.data].map((item, itemIndex) => {
          const schema = this._def.items[itemIndex] || this._def.rest;
          if (!schema)
            return null;
          return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
        }).filter((x) => !!x);
        if (ctx.common.async) {
          return Promise.all(items).then((results) => {
            return ParseStatus.mergeArray(status, results);
          });
        } else {
          return ParseStatus.mergeArray(status, items);
        }
      }
      get items() {
        return this._def.items;
      }
      rest(rest) {
        return new _ZodTuple({
          ...this._def,
          rest
        });
      }
    };
    ZodTuple.create = (schemas, params) => {
      if (!Array.isArray(schemas)) {
        throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
      }
      return new ZodTuple({
        items: schemas,
        typeName: ZodFirstPartyTypeKind.ZodTuple,
        rest: null,
        ...processCreateParams(params)
      });
    };
    ZodRecord = class _ZodRecord extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const pairs = [];
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        for (const key in ctx.data) {
          pairs.push({
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
            value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (ctx.common.async) {
          return ParseStatus.mergeObjectAsync(status, pairs);
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get element() {
        return this._def.valueType;
      }
      static create(first, second, third) {
        if (second instanceof ZodType) {
          return new _ZodRecord({
            keyType: first,
            valueType: second,
            typeName: ZodFirstPartyTypeKind.ZodRecord,
            ...processCreateParams(third)
          });
        }
        return new _ZodRecord({
          keyType: ZodString.create(),
          valueType: first,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(second)
        });
      }
    };
    ZodMap = class extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.map) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.map,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        const pairs = [...ctx.data.entries()].map(([key, value], index) => {
          return {
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
            value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
          };
        });
        if (ctx.common.async) {
          const finalMap = /* @__PURE__ */ new Map();
          return Promise.resolve().then(async () => {
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              if (key.status === "aborted" || value.status === "aborted") {
                return INVALID;
              }
              if (key.status === "dirty" || value.status === "dirty") {
                status.dirty();
              }
              finalMap.set(key.value, value.value);
            }
            return { status: status.value, value: finalMap };
          });
        } else {
          const finalMap = /* @__PURE__ */ new Map();
          for (const pair of pairs) {
            const key = pair.key;
            const value = pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        }
      }
    };
    ZodMap.create = (keyType, valueType, params) => {
      return new ZodMap({
        valueType,
        keyType,
        typeName: ZodFirstPartyTypeKind.ZodMap,
        ...processCreateParams(params)
      });
    };
    ZodSet = class _ZodSet extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.set) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.set,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const def = this._def;
        if (def.minSize !== null) {
          if (ctx.data.size < def.minSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.minSize.message
            });
            status.dirty();
          }
        }
        if (def.maxSize !== null) {
          if (ctx.data.size > def.maxSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.maxSize.message
            });
            status.dirty();
          }
        }
        const valueType = this._def.valueType;
        function finalizeSet(elements2) {
          const parsedSet = /* @__PURE__ */ new Set();
          for (const element of elements2) {
            if (element.status === "aborted")
              return INVALID;
            if (element.status === "dirty")
              status.dirty();
            parsedSet.add(element.value);
          }
          return { status: status.value, value: parsedSet };
        }
        const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
        if (ctx.common.async) {
          return Promise.all(elements).then((elements2) => finalizeSet(elements2));
        } else {
          return finalizeSet(elements);
        }
      }
      min(minSize, message) {
        return new _ZodSet({
          ...this._def,
          minSize: { value: minSize, message: errorUtil.toString(message) }
        });
      }
      max(maxSize, message) {
        return new _ZodSet({
          ...this._def,
          maxSize: { value: maxSize, message: errorUtil.toString(message) }
        });
      }
      size(size, message) {
        return this.min(size, message).max(size, message);
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodSet.create = (valueType, params) => {
      return new ZodSet({
        valueType,
        minSize: null,
        maxSize: null,
        typeName: ZodFirstPartyTypeKind.ZodSet,
        ...processCreateParams(params)
      });
    };
    ZodFunction = class _ZodFunction extends ZodType {
      constructor() {
        super(...arguments);
        this.validate = this.implement;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.function) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.function,
            received: ctx.parsedType
          });
          return INVALID;
        }
        function makeArgsIssue(args, error) {
          return makeIssue({
            data: args,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_arguments,
              argumentsError: error
            }
          });
        }
        function makeReturnsIssue(returns, error) {
          return makeIssue({
            data: returns,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_return_type,
              returnTypeError: error
            }
          });
        }
        const params = { errorMap: ctx.common.contextualErrorMap };
        const fn = ctx.data;
        if (this._def.returns instanceof ZodPromise) {
          const me = this;
          return OK(async function(...args) {
            const error = new ZodError([]);
            const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
              error.addIssue(makeArgsIssue(args, e));
              throw error;
            });
            const result = await Reflect.apply(fn, this, parsedArgs);
            const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
              error.addIssue(makeReturnsIssue(result, e));
              throw error;
            });
            return parsedReturns;
          });
        } else {
          const me = this;
          return OK(function(...args) {
            const parsedArgs = me._def.args.safeParse(args, params);
            if (!parsedArgs.success) {
              throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
            }
            const result = Reflect.apply(fn, this, parsedArgs.data);
            const parsedReturns = me._def.returns.safeParse(result, params);
            if (!parsedReturns.success) {
              throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
            }
            return parsedReturns.data;
          });
        }
      }
      parameters() {
        return this._def.args;
      }
      returnType() {
        return this._def.returns;
      }
      args(...items) {
        return new _ZodFunction({
          ...this._def,
          args: ZodTuple.create(items).rest(ZodUnknown.create())
        });
      }
      returns(returnType) {
        return new _ZodFunction({
          ...this._def,
          returns: returnType
        });
      }
      implement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      strictImplement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      static create(args, returns, params) {
        return new _ZodFunction({
          args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
          returns: returns || ZodUnknown.create(),
          typeName: ZodFirstPartyTypeKind.ZodFunction,
          ...processCreateParams(params)
        });
      }
    };
    ZodLazy = class extends ZodType {
      get schema() {
        return this._def.getter();
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const lazySchema = this._def.getter();
        return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
      }
    };
    ZodLazy.create = (getter, params) => {
      return new ZodLazy({
        getter,
        typeName: ZodFirstPartyTypeKind.ZodLazy,
        ...processCreateParams(params)
      });
    };
    ZodLiteral = class extends ZodType {
      _parse(input) {
        if (input.data !== this._def.value) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_literal,
            expected: this._def.value
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
      get value() {
        return this._def.value;
      }
    };
    ZodLiteral.create = (value, params) => {
      return new ZodLiteral({
        value,
        typeName: ZodFirstPartyTypeKind.ZodLiteral,
        ...processCreateParams(params)
      });
    };
    ZodEnum = class _ZodEnum extends ZodType {
      _parse(input) {
        if (typeof input.data !== "string") {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(this._def.values);
        }
        if (!this._cache.has(input.data)) {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get options() {
        return this._def.values;
      }
      get enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Values() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      extract(values, newDef = this._def) {
        return _ZodEnum.create(values, {
          ...this._def,
          ...newDef
        });
      }
      exclude(values, newDef = this._def) {
        return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
          ...this._def,
          ...newDef
        });
      }
    };
    ZodEnum.create = createZodEnum;
    ZodNativeEnum = class extends ZodType {
      _parse(input) {
        const nativeEnumValues = util.getValidEnumValues(this._def.values);
        const ctx = this._getOrReturnCtx(input);
        if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(util.getValidEnumValues(this._def.values));
        }
        if (!this._cache.has(input.data)) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get enum() {
        return this._def.values;
      }
    };
    ZodNativeEnum.create = (values, params) => {
      return new ZodNativeEnum({
        values,
        typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
        ...processCreateParams(params)
      });
    };
    ZodPromise = class extends ZodType {
      unwrap() {
        return this._def.type;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.promise,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
        return OK(promisified.then((data) => {
          return this._def.type.parseAsync(data, {
            path: ctx.path,
            errorMap: ctx.common.contextualErrorMap
          });
        }));
      }
    };
    ZodPromise.create = (schema, params) => {
      return new ZodPromise({
        type: schema,
        typeName: ZodFirstPartyTypeKind.ZodPromise,
        ...processCreateParams(params)
      });
    };
    ZodEffects = class extends ZodType {
      innerType() {
        return this._def.schema;
      }
      sourceType() {
        return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const effect = this._def.effect || null;
        const checkCtx = {
          addIssue: (arg) => {
            addIssueToContext(ctx, arg);
            if (arg.fatal) {
              status.abort();
            } else {
              status.dirty();
            }
          },
          get path() {
            return ctx.path;
          }
        };
        checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
        if (effect.type === "preprocess") {
          const processed = effect.transform(ctx.data, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(processed).then(async (processed2) => {
              if (status.value === "aborted")
                return INVALID;
              const result = await this._def.schema._parseAsync({
                data: processed2,
                path: ctx.path,
                parent: ctx
              });
              if (result.status === "aborted")
                return INVALID;
              if (result.status === "dirty")
                return DIRTY(result.value);
              if (status.value === "dirty")
                return DIRTY(result.value);
              return result;
            });
          } else {
            if (status.value === "aborted")
              return INVALID;
            const result = this._def.schema._parseSync({
              data: processed,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          }
        }
        if (effect.type === "refinement") {
          const executeRefinement = (acc) => {
            const result = effect.refinement(acc, checkCtx);
            if (ctx.common.async) {
              return Promise.resolve(result);
            }
            if (result instanceof Promise) {
              throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
            }
            return acc;
          };
          if (ctx.common.async === false) {
            const inner = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            executeRefinement(inner.value);
            return { status: status.value, value: inner.value };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
              if (inner.status === "aborted")
                return INVALID;
              if (inner.status === "dirty")
                status.dirty();
              return executeRefinement(inner.value).then(() => {
                return { status: status.value, value: inner.value };
              });
            });
          }
        }
        if (effect.type === "transform") {
          if (ctx.common.async === false) {
            const base = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (!isValid(base))
              return INVALID;
            const result = effect.transform(base.value, checkCtx);
            if (result instanceof Promise) {
              throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
            }
            return { status: status.value, value: result };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
              if (!isValid(base))
                return INVALID;
              return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
                status: status.value,
                value: result
              }));
            });
          }
        }
        util.assertNever(effect);
      }
    };
    ZodEffects.create = (schema, effect, params) => {
      return new ZodEffects({
        schema,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect,
        ...processCreateParams(params)
      });
    };
    ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
      return new ZodEffects({
        schema,
        effect: { type: "preprocess", transform: preprocess },
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        ...processCreateParams(params)
      });
    };
    ZodOptional = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.undefined) {
          return OK(void 0);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodOptional.create = (type, params) => {
      return new ZodOptional({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodOptional,
        ...processCreateParams(params)
      });
    };
    ZodNullable = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.null) {
          return OK(null);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodNullable.create = (type, params) => {
      return new ZodNullable({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodNullable,
        ...processCreateParams(params)
      });
    };
    ZodDefault = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        let data = ctx.data;
        if (ctx.parsedType === ZodParsedType.undefined) {
          data = this._def.defaultValue();
        }
        return this._def.innerType._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      removeDefault() {
        return this._def.innerType;
      }
    };
    ZodDefault.create = (type, params) => {
      return new ZodDefault({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodDefault,
        defaultValue: typeof params.default === "function" ? params.default : () => params.default,
        ...processCreateParams(params)
      });
    };
    ZodCatch = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const newCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          }
        };
        const result = this._def.innerType._parse({
          data: newCtx.data,
          path: newCtx.path,
          parent: {
            ...newCtx
          }
        });
        if (isAsync(result)) {
          return result.then((result2) => {
            return {
              status: "valid",
              value: result2.status === "valid" ? result2.value : this._def.catchValue({
                get error() {
                  return new ZodError(newCtx.common.issues);
                },
                input: newCtx.data
              })
            };
          });
        } else {
          return {
            status: "valid",
            value: result.status === "valid" ? result.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        }
      }
      removeCatch() {
        return this._def.innerType;
      }
    };
    ZodCatch.create = (type, params) => {
      return new ZodCatch({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodCatch,
        catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
        ...processCreateParams(params)
      });
    };
    ZodNaN = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.nan) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.nan,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
    };
    ZodNaN.create = (params) => {
      return new ZodNaN({
        typeName: ZodFirstPartyTypeKind.ZodNaN,
        ...processCreateParams(params)
      });
    };
    BRAND = /* @__PURE__ */ Symbol("zod_brand");
    ZodBranded = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const data = ctx.data;
        return this._def.type._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      unwrap() {
        return this._def.type;
      }
    };
    ZodPipeline = class _ZodPipeline extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.common.async) {
          const handleAsync = async () => {
            const inResult = await this._def.in._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inResult.status === "aborted")
              return INVALID;
            if (inResult.status === "dirty") {
              status.dirty();
              return DIRTY(inResult.value);
            } else {
              return this._def.out._parseAsync({
                data: inResult.value,
                path: ctx.path,
                parent: ctx
              });
            }
          };
          return handleAsync();
        } else {
          const inResult = this._def.in._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return {
              status: "dirty",
              value: inResult.value
            };
          } else {
            return this._def.out._parseSync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        }
      }
      static create(a, b) {
        return new _ZodPipeline({
          in: a,
          out: b,
          typeName: ZodFirstPartyTypeKind.ZodPipeline
        });
      }
    };
    ZodReadonly = class extends ZodType {
      _parse(input) {
        const result = this._def.innerType._parse(input);
        const freeze = (data) => {
          if (isValid(data)) {
            data.value = Object.freeze(data.value);
          }
          return data;
        };
        return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodReadonly.create = (type, params) => {
      return new ZodReadonly({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodReadonly,
        ...processCreateParams(params)
      });
    };
    late = {
      object: ZodObject.lazycreate
    };
    (function(ZodFirstPartyTypeKind2) {
      ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
      ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
      ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
      ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
      ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
      ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
      ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
      ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
      ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
      ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
      ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
      ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
      ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
      ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
      ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
      ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
      ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
      ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
      ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
      ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
      ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
      ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
      ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
      ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
      ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
      ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
      ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
      ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
      ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
      ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
      ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
      ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
      ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
      ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
      ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
      ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
    })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
    instanceOfType = (cls, params = {
      message: `Input not instance of ${cls.name}`
    }) => custom((data) => data instanceof cls, params);
    stringType = ZodString.create;
    numberType = ZodNumber.create;
    nanType = ZodNaN.create;
    bigIntType = ZodBigInt.create;
    booleanType = ZodBoolean.create;
    dateType = ZodDate.create;
    symbolType = ZodSymbol.create;
    undefinedType = ZodUndefined.create;
    nullType = ZodNull.create;
    anyType = ZodAny.create;
    unknownType = ZodUnknown.create;
    neverType = ZodNever.create;
    voidType = ZodVoid.create;
    arrayType = ZodArray.create;
    objectType = ZodObject.create;
    strictObjectType = ZodObject.strictCreate;
    unionType = ZodUnion.create;
    discriminatedUnionType = ZodDiscriminatedUnion.create;
    intersectionType = ZodIntersection.create;
    tupleType = ZodTuple.create;
    recordType = ZodRecord.create;
    mapType = ZodMap.create;
    setType = ZodSet.create;
    functionType = ZodFunction.create;
    lazyType = ZodLazy.create;
    literalType = ZodLiteral.create;
    enumType = ZodEnum.create;
    nativeEnumType = ZodNativeEnum.create;
    promiseType = ZodPromise.create;
    effectsType = ZodEffects.create;
    optionalType = ZodOptional.create;
    nullableType = ZodNullable.create;
    preprocessType = ZodEffects.createWithPreprocess;
    pipelineType = ZodPipeline.create;
    ostring = () => stringType().optional();
    onumber = () => numberType().optional();
    oboolean = () => booleanType().optional();
    coerce = {
      string: ((arg) => ZodString.create({ ...arg, coerce: true })),
      number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
      boolean: ((arg) => ZodBoolean.create({
        ...arg,
        coerce: true
      })),
      bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
      date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
    };
    NEVER = INVALID;
  }
});

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});
var init_external = __esm({
  "node_modules/zod/v3/external.js"() {
    init_errors();
    init_parseUtil();
    init_typeAliases();
    init_util();
    init_types();
    init_ZodError();
  }
});

// node_modules/zod/index.js
var init_zod = __esm({
  "node_modules/zod/index.js"() {
    init_external();
    init_external();
  }
});

// node_modules/@ai-sdk/provider/dist/index.mjs
function getErrorMessage(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}
function isJSONValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJSONValue);
  }
  if (typeof value === "object") {
    return Object.entries(value).every(
      ([key, val]) => typeof key === "string" && isJSONValue(val)
    );
  }
  return false;
}
function isJSONArray(value) {
  return Array.isArray(value) && value.every(isJSONValue);
}
function isJSONObject(value) {
  return value != null && typeof value === "object" && Object.entries(value).every(
    ([key, val]) => typeof key === "string" && isJSONValue(val)
  );
}
var marker, symbol, _a, _AISDKError, AISDKError, name, marker2, symbol2, _a2, APICallError, name2, marker3, symbol3, _a3, EmptyResponseBodyError, name3, marker4, symbol4, _a4, InvalidArgumentError, name4, marker5, symbol5, _a5, InvalidPromptError, name5, marker6, symbol6, _a6, InvalidResponseDataError, name6, marker7, symbol7, _a7, JSONParseError, name7, marker8, symbol8, _a8, LoadAPIKeyError, name8, marker9, symbol9, _a9, name9, marker10, symbol10, _a10, name10, marker11, symbol11, _a11, NoSuchModelError, name11, marker12, symbol12, _a12, TooManyEmbeddingValuesForCallError, name12, marker13, symbol13, _a13, _TypeValidationError, TypeValidationError, name13, marker14, symbol14, _a14, UnsupportedFunctionalityError;
var init_dist = __esm({
  "node_modules/@ai-sdk/provider/dist/index.mjs"() {
    marker = "vercel.ai.error";
    symbol = Symbol.for(marker);
    _AISDKError = class _AISDKError2 extends Error {
      /**
       * Creates an AI SDK Error.
       *
       * @param {Object} params - The parameters for creating the error.
       * @param {string} params.name - The name of the error.
       * @param {string} params.message - The error message.
       * @param {unknown} [params.cause] - The underlying cause of the error.
       */
      constructor({
        name: name143,
        message,
        cause
      }) {
        super(message);
        this[_a] = true;
        this.name = name143;
        this.cause = cause;
      }
      /**
       * Checks if the given error is an AI SDK Error.
       * @param {unknown} error - The error to check.
       * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
       */
      static isInstance(error) {
        return _AISDKError2.hasMarker(error, marker);
      }
      static hasMarker(error, marker153) {
        const markerSymbol = Symbol.for(marker153);
        return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
      }
    };
    _a = symbol;
    AISDKError = _AISDKError;
    name = "AI_APICallError";
    marker2 = `vercel.ai.error.${name}`;
    symbol2 = Symbol.for(marker2);
    APICallError = class extends AISDKError {
      constructor({
        message,
        url,
        requestBodyValues,
        statusCode,
        responseHeaders,
        responseBody,
        cause,
        isRetryable = statusCode != null && (statusCode === 408 || // request timeout
        statusCode === 409 || // conflict
        statusCode === 429 || // too many requests
        statusCode >= 500),
        // server error
        data
      }) {
        super({ name, message, cause });
        this[_a2] = true;
        this.url = url;
        this.requestBodyValues = requestBodyValues;
        this.statusCode = statusCode;
        this.responseHeaders = responseHeaders;
        this.responseBody = responseBody;
        this.isRetryable = isRetryable;
        this.data = data;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker2);
      }
    };
    _a2 = symbol2;
    name2 = "AI_EmptyResponseBodyError";
    marker3 = `vercel.ai.error.${name2}`;
    symbol3 = Symbol.for(marker3);
    EmptyResponseBodyError = class extends AISDKError {
      // used in isInstance
      constructor({ message = "Empty response body" } = {}) {
        super({ name: name2, message });
        this[_a3] = true;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker3);
      }
    };
    _a3 = symbol3;
    name3 = "AI_InvalidArgumentError";
    marker4 = `vercel.ai.error.${name3}`;
    symbol4 = Symbol.for(marker4);
    InvalidArgumentError = class extends AISDKError {
      constructor({
        message,
        cause,
        argument
      }) {
        super({ name: name3, message, cause });
        this[_a4] = true;
        this.argument = argument;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker4);
      }
    };
    _a4 = symbol4;
    name4 = "AI_InvalidPromptError";
    marker5 = `vercel.ai.error.${name4}`;
    symbol5 = Symbol.for(marker5);
    InvalidPromptError = class extends AISDKError {
      constructor({
        prompt,
        message,
        cause
      }) {
        super({ name: name4, message: `Invalid prompt: ${message}`, cause });
        this[_a5] = true;
        this.prompt = prompt;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker5);
      }
    };
    _a5 = symbol5;
    name5 = "AI_InvalidResponseDataError";
    marker6 = `vercel.ai.error.${name5}`;
    symbol6 = Symbol.for(marker6);
    InvalidResponseDataError = class extends AISDKError {
      constructor({
        data,
        message = `Invalid response data: ${JSON.stringify(data)}.`
      }) {
        super({ name: name5, message });
        this[_a6] = true;
        this.data = data;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker6);
      }
    };
    _a6 = symbol6;
    name6 = "AI_JSONParseError";
    marker7 = `vercel.ai.error.${name6}`;
    symbol7 = Symbol.for(marker7);
    JSONParseError = class extends AISDKError {
      constructor({ text: text2, cause }) {
        super({
          name: name6,
          message: `JSON parsing failed: Text: ${text2}.
Error message: ${getErrorMessage(cause)}`,
          cause
        });
        this[_a7] = true;
        this.text = text2;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker7);
      }
    };
    _a7 = symbol7;
    name7 = "AI_LoadAPIKeyError";
    marker8 = `vercel.ai.error.${name7}`;
    symbol8 = Symbol.for(marker8);
    LoadAPIKeyError = class extends AISDKError {
      // used in isInstance
      constructor({ message }) {
        super({ name: name7, message });
        this[_a8] = true;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker8);
      }
    };
    _a8 = symbol8;
    name8 = "AI_LoadSettingError";
    marker9 = `vercel.ai.error.${name8}`;
    symbol9 = Symbol.for(marker9);
    _a9 = symbol9;
    name9 = "AI_NoContentGeneratedError";
    marker10 = `vercel.ai.error.${name9}`;
    symbol10 = Symbol.for(marker10);
    _a10 = symbol10;
    name10 = "AI_NoSuchModelError";
    marker11 = `vercel.ai.error.${name10}`;
    symbol11 = Symbol.for(marker11);
    NoSuchModelError = class extends AISDKError {
      constructor({
        errorName = name10,
        modelId,
        modelType,
        message = `No such ${modelType}: ${modelId}`
      }) {
        super({ name: errorName, message });
        this[_a11] = true;
        this.modelId = modelId;
        this.modelType = modelType;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker11);
      }
    };
    _a11 = symbol11;
    name11 = "AI_TooManyEmbeddingValuesForCallError";
    marker12 = `vercel.ai.error.${name11}`;
    symbol12 = Symbol.for(marker12);
    TooManyEmbeddingValuesForCallError = class extends AISDKError {
      constructor(options) {
        super({
          name: name11,
          message: `Too many values for a single embedding call. The ${options.provider} model "${options.modelId}" can only embed up to ${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`
        });
        this[_a12] = true;
        this.provider = options.provider;
        this.modelId = options.modelId;
        this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
        this.values = options.values;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker12);
      }
    };
    _a12 = symbol12;
    name12 = "AI_TypeValidationError";
    marker13 = `vercel.ai.error.${name12}`;
    symbol13 = Symbol.for(marker13);
    _TypeValidationError = class _TypeValidationError2 extends AISDKError {
      constructor({ value, cause }) {
        super({
          name: name12,
          message: `Type validation failed: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage(cause)}`,
          cause
        });
        this[_a13] = true;
        this.value = value;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker13);
      }
      /**
       * Wraps an error into a TypeValidationError.
       * If the cause is already a TypeValidationError with the same value, it returns the cause.
       * Otherwise, it creates a new TypeValidationError.
       *
       * @param {Object} params - The parameters for wrapping the error.
       * @param {unknown} params.value - The value that failed validation.
       * @param {unknown} params.cause - The original error or cause of the validation failure.
       * @returns {TypeValidationError} A TypeValidationError instance.
       */
      static wrap({
        value,
        cause
      }) {
        return _TypeValidationError2.isInstance(cause) && cause.value === value ? cause : new _TypeValidationError2({ value, cause });
      }
    };
    _a13 = symbol13;
    TypeValidationError = _TypeValidationError;
    name13 = "AI_UnsupportedFunctionalityError";
    marker14 = `vercel.ai.error.${name13}`;
    symbol14 = Symbol.for(marker14);
    UnsupportedFunctionalityError = class extends AISDKError {
      constructor({
        functionality,
        message = `'${functionality}' functionality not supported.`
      }) {
        super({ name: name13, message });
        this[_a14] = true;
        this.functionality = functionality;
      }
      static isInstance(error) {
        return AISDKError.hasMarker(error, marker14);
      }
    };
    _a14 = symbol14;
  }
});

// node_modules/nanoid/non-secure/index.js
var customAlphabet;
var init_non_secure = __esm({
  "node_modules/nanoid/non-secure/index.js"() {
    customAlphabet = (alphabet, defaultSize = 21) => {
      return (size = defaultSize) => {
        let id = "";
        let i = size | 0;
        while (i--) {
          id += alphabet[Math.random() * alphabet.length | 0];
        }
        return id;
      };
    };
  }
});

// node_modules/secure-json-parse/index.js
var require_secure_json_parse = __commonJS({
  "node_modules/secure-json-parse/index.js"(exports, module) {
    "use strict";
    var hasBuffer = typeof Buffer !== "undefined";
    var suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
    var suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
    function _parse(text2, reviver, options) {
      if (options == null) {
        if (reviver !== null && typeof reviver === "object") {
          options = reviver;
          reviver = void 0;
        }
      }
      if (hasBuffer && Buffer.isBuffer(text2)) {
        text2 = text2.toString();
      }
      if (text2 && text2.charCodeAt(0) === 65279) {
        text2 = text2.slice(1);
      }
      const obj = JSON.parse(text2, reviver);
      if (obj === null || typeof obj !== "object") {
        return obj;
      }
      const protoAction = options && options.protoAction || "error";
      const constructorAction = options && options.constructorAction || "error";
      if (protoAction === "ignore" && constructorAction === "ignore") {
        return obj;
      }
      if (protoAction !== "ignore" && constructorAction !== "ignore") {
        if (suspectProtoRx.test(text2) === false && suspectConstructorRx.test(text2) === false) {
          return obj;
        }
      } else if (protoAction !== "ignore" && constructorAction === "ignore") {
        if (suspectProtoRx.test(text2) === false) {
          return obj;
        }
      } else {
        if (suspectConstructorRx.test(text2) === false) {
          return obj;
        }
      }
      return filter(obj, { protoAction, constructorAction, safe: options && options.safe });
    }
    function filter(obj, { protoAction = "error", constructorAction = "error", safe } = {}) {
      let next = [obj];
      while (next.length) {
        const nodes = next;
        next = [];
        for (const node of nodes) {
          if (protoAction !== "ignore" && Object.prototype.hasOwnProperty.call(node, "__proto__")) {
            if (safe === true) {
              return null;
            } else if (protoAction === "error") {
              throw new SyntaxError("Object contains forbidden prototype property");
            }
            delete node.__proto__;
          }
          if (constructorAction !== "ignore" && Object.prototype.hasOwnProperty.call(node, "constructor") && Object.prototype.hasOwnProperty.call(node.constructor, "prototype")) {
            if (safe === true) {
              return null;
            } else if (constructorAction === "error") {
              throw new SyntaxError("Object contains forbidden prototype property");
            }
            delete node.constructor;
          }
          for (const key in node) {
            const value = node[key];
            if (value && typeof value === "object") {
              next.push(value);
            }
          }
        }
      }
      return obj;
    }
    function parse(text2, reviver, options) {
      const stackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 0;
      try {
        return _parse(text2, reviver, options);
      } finally {
        Error.stackTraceLimit = stackTraceLimit;
      }
    }
    function safeParse(text2, reviver) {
      const stackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 0;
      try {
        return _parse(text2, reviver, { safe: true });
      } catch (_e) {
        return null;
      } finally {
        Error.stackTraceLimit = stackTraceLimit;
      }
    }
    module.exports = parse;
    module.exports.default = parse;
    module.exports.parse = parse;
    module.exports.safeParse = safeParse;
    module.exports.scan = filter;
  }
});

// node_modules/@ai-sdk/provider-utils/dist/index.mjs
function combineHeaders(...headers9) {
  return headers9.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...currentHeaders != null ? currentHeaders : {}
    }),
    {}
  );
}
function convertAsyncIteratorToReadableStream(iterator) {
  return new ReadableStream({
    /**
     * Called when the consumer wants to pull more data from the stream.
     *
     * @param {ReadableStreamDefaultController<T>} controller - The controller to enqueue data into the stream.
     * @returns {Promise<void>}
     */
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    /**
     * Called when the consumer cancels the stream.
     */
    cancel() {
    }
  });
}
async function delay(delayInMs) {
  return delayInMs == null ? Promise.resolve() : new Promise((resolve2) => setTimeout(resolve2, delayInMs));
}
function createEventSourceParserStream() {
  let buffer = "";
  let event = void 0;
  let data = [];
  let lastEventId = void 0;
  let retry = void 0;
  function parseLine(line, controller) {
    if (line === "") {
      dispatchEvent(controller);
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      handleField(line, "");
      return;
    }
    const field = line.slice(0, colonIndex);
    const valueStart = colonIndex + 1;
    const value = valueStart < line.length && line[valueStart] === " " ? line.slice(valueStart + 1) : line.slice(valueStart);
    handleField(field, value);
  }
  function dispatchEvent(controller) {
    if (data.length > 0) {
      controller.enqueue({
        event,
        data: data.join("\n"),
        id: lastEventId,
        retry
      });
      data = [];
      event = void 0;
      retry = void 0;
    }
  }
  function handleField(field, value) {
    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        data.push(value);
        break;
      case "id":
        lastEventId = value;
        break;
      case "retry":
        const parsedRetry = parseInt(value, 10);
        if (!isNaN(parsedRetry)) {
          retry = parsedRetry;
        }
        break;
    }
  }
  return new TransformStream({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines(buffer, chunk);
      buffer = incompleteLine;
      for (let i = 0; i < lines.length; i++) {
        parseLine(lines[i], controller);
      }
    },
    flush(controller) {
      parseLine(buffer, controller);
      dispatchEvent(controller);
    }
  });
}
function splitLines(buffer, chunk) {
  const lines = [];
  let currentLine = buffer;
  for (let i = 0; i < chunk.length; ) {
    const char = chunk[i++];
    if (char === "\n") {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r") {
      lines.push(currentLine);
      currentLine = "";
      if (chunk[i] === "\n") {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  return { lines, incompleteLine: currentLine };
}
function extractResponseHeaders(response) {
  const headers9 = {};
  response.headers.forEach((value, key) => {
    headers9[key] = value;
  });
  return headers9;
}
function getErrorMessage2(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}
function removeUndefinedEntries(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([_key, value]) => value != null)
  );
}
function isAbortError(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
function loadApiKey({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = "apiKey",
  description
}) {
  if (typeof apiKey === "string") {
    return apiKey;
  }
  if (apiKey != null) {
    throw new LoadAPIKeyError({
      message: `${description} API key must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`
    });
  }
  apiKey = process.env[environmentVariableName];
  if (apiKey == null) {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof apiKey !== "string") {
    throw new LoadAPIKeyError({
      message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return apiKey;
}
function validator(validate) {
  return { [validatorSymbol]: true, validate };
}
function isValidator(value) {
  return typeof value === "object" && value !== null && validatorSymbol in value && value[validatorSymbol] === true && "validate" in value;
}
function asValidator(value) {
  return isValidator(value) ? value : zodValidator(value);
}
function zodValidator(zodSchema2) {
  return validator((value) => {
    const result = zodSchema2.safeParse(value);
    return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
  });
}
function validateTypes({
  value,
  schema: inputSchema
}) {
  const result = safeValidateTypes({ value, schema: inputSchema });
  if (!result.success) {
    throw TypeValidationError.wrap({ value, cause: result.error });
  }
  return result.value;
}
function safeValidateTypes({
  value,
  schema
}) {
  const validator2 = asValidator(schema);
  try {
    if (validator2.validate == null) {
      return { success: true, value };
    }
    const result = validator2.validate(value);
    if (result.success) {
      return result;
    }
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: result.error })
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: error })
    };
  }
}
function parseJSON({
  text: text2,
  schema
}) {
  try {
    const value = import_secure_json_parse.default.parse(text2);
    if (schema == null) {
      return value;
    }
    return validateTypes({ value, schema });
  } catch (error) {
    if (JSONParseError.isInstance(error) || TypeValidationError.isInstance(error)) {
      throw error;
    }
    throw new JSONParseError({ text: text2, cause: error });
  }
}
function safeParseJSON({
  text: text2,
  schema
}) {
  try {
    const value = import_secure_json_parse.default.parse(text2);
    if (schema == null) {
      return { success: true, value, rawValue: value };
    }
    const validationResult = safeValidateTypes({ value, schema });
    return validationResult.success ? { ...validationResult, rawValue: value } : validationResult;
  } catch (error) {
    return {
      success: false,
      error: JSONParseError.isInstance(error) ? error : new JSONParseError({ text: text2, cause: error })
    };
  }
}
function isParsableJson(input) {
  try {
    import_secure_json_parse.default.parse(input);
    return true;
  } catch (e) {
    return false;
  }
}
function parseProviderOptions({
  provider,
  providerOptions,
  schema
}) {
  if ((providerOptions == null ? void 0 : providerOptions[provider]) == null) {
    return void 0;
  }
  const parsedProviderOptions = safeValidateTypes({
    value: providerOptions[provider],
    schema
  });
  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError({
      argument: "providerOptions",
      message: `invalid ${provider} provider options`,
      cause: parsedProviderOptions.error
    });
  }
  return parsedProviderOptions.value;
}
async function resolve(value) {
  if (typeof value === "function") {
    value = value();
  }
  return Promise.resolve(value);
}
function convertBase64ToUint8Array(base64String) {
  const base64Url = base64String.replace(/-/g, "+").replace(/_/g, "/");
  const latin1string = atob2(base64Url);
  return Uint8Array.from(latin1string, (byte) => byte.codePointAt(0));
}
function convertUint8ArrayToBase64(array) {
  let latin1string = "";
  for (let i = 0; i < array.length; i++) {
    latin1string += String.fromCodePoint(array[i]);
  }
  return btoa(latin1string);
}
function withoutTrailingSlash(url) {
  return url == null ? void 0 : url.replace(/\/$/, "");
}
var import_secure_json_parse, createIdGenerator, generateId, validatorSymbol, getOriginalFetch2, postJsonToApi, postFormDataToApi, postToApi, createJsonErrorResponseHandler, createEventSourceResponseHandler, createJsonResponseHandler, createBinaryResponseHandler, btoa, atob2;
var init_dist2 = __esm({
  "node_modules/@ai-sdk/provider-utils/dist/index.mjs"() {
    init_dist();
    init_non_secure();
    init_dist();
    init_dist();
    import_secure_json_parse = __toESM(require_secure_json_parse(), 1);
    init_dist();
    init_dist();
    init_dist();
    init_dist();
    createIdGenerator = ({
      prefix,
      size: defaultSize = 16,
      alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      separator = "-"
    } = {}) => {
      const generator = customAlphabet(alphabet, defaultSize);
      if (prefix == null) {
        return generator;
      }
      if (alphabet.includes(separator)) {
        throw new InvalidArgumentError({
          argument: "separator",
          message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
        });
      }
      return (size) => `${prefix}${separator}${generator(size)}`;
    };
    generateId = createIdGenerator();
    validatorSymbol = /* @__PURE__ */ Symbol.for("vercel.ai.validator");
    getOriginalFetch2 = () => globalThis.fetch;
    postJsonToApi = async ({
      url,
      headers: headers9,
      body,
      failedResponseHandler,
      successfulResponseHandler,
      abortSignal,
      fetch: fetch2
    }) => postToApi({
      url,
      headers: {
        "Content-Type": "application/json",
        ...headers9
      },
      body: {
        content: JSON.stringify(body),
        values: body
      },
      failedResponseHandler,
      successfulResponseHandler,
      abortSignal,
      fetch: fetch2
    });
    postFormDataToApi = async ({
      url,
      headers: headers9,
      formData,
      failedResponseHandler,
      successfulResponseHandler,
      abortSignal,
      fetch: fetch2
    }) => postToApi({
      url,
      headers: headers9,
      body: {
        content: formData,
        values: Object.fromEntries(formData.entries())
      },
      failedResponseHandler,
      successfulResponseHandler,
      abortSignal,
      fetch: fetch2
    });
    postToApi = async ({
      url,
      headers: headers9 = {},
      body,
      successfulResponseHandler,
      failedResponseHandler,
      abortSignal,
      fetch: fetch2 = getOriginalFetch2()
    }) => {
      try {
        const response = await fetch2(url, {
          method: "POST",
          headers: removeUndefinedEntries(headers9),
          body: body.content,
          signal: abortSignal
        });
        const responseHeaders = extractResponseHeaders(response);
        if (!response.ok) {
          let errorInformation;
          try {
            errorInformation = await failedResponseHandler({
              response,
              url,
              requestBodyValues: body.values
            });
          } catch (error) {
            if (isAbortError(error) || APICallError.isInstance(error)) {
              throw error;
            }
            throw new APICallError({
              message: "Failed to process error response",
              cause: error,
              statusCode: response.status,
              url,
              responseHeaders,
              requestBodyValues: body.values
            });
          }
          throw errorInformation.value;
        }
        try {
          return await successfulResponseHandler({
            response,
            url,
            requestBodyValues: body.values
          });
        } catch (error) {
          if (error instanceof Error) {
            if (isAbortError(error) || APICallError.isInstance(error)) {
              throw error;
            }
          }
          throw new APICallError({
            message: "Failed to process successful response",
            cause: error,
            statusCode: response.status,
            url,
            responseHeaders,
            requestBodyValues: body.values
          });
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        if (error instanceof TypeError && error.message === "fetch failed") {
          const cause = error.cause;
          if (cause != null) {
            throw new APICallError({
              message: `Cannot connect to API: ${cause.message}`,
              cause,
              url,
              requestBodyValues: body.values,
              isRetryable: true
              // retry when network error
            });
          }
        }
        throw error;
      }
    };
    createJsonErrorResponseHandler = ({
      errorSchema,
      errorToMessage,
      isRetryable
    }) => async ({ response, url, requestBodyValues }) => {
      const responseBody = await response.text();
      const responseHeaders = extractResponseHeaders(response);
      if (responseBody.trim() === "") {
        return {
          responseHeaders,
          value: new APICallError({
            message: response.statusText,
            url,
            requestBodyValues,
            statusCode: response.status,
            responseHeaders,
            responseBody,
            isRetryable: isRetryable == null ? void 0 : isRetryable(response)
          })
        };
      }
      try {
        const parsedError = parseJSON({
          text: responseBody,
          schema: errorSchema
        });
        return {
          responseHeaders,
          value: new APICallError({
            message: errorToMessage(parsedError),
            url,
            requestBodyValues,
            statusCode: response.status,
            responseHeaders,
            responseBody,
            data: parsedError,
            isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
          })
        };
      } catch (parseError) {
        return {
          responseHeaders,
          value: new APICallError({
            message: response.statusText,
            url,
            requestBodyValues,
            statusCode: response.status,
            responseHeaders,
            responseBody,
            isRetryable: isRetryable == null ? void 0 : isRetryable(response)
          })
        };
      }
    };
    createEventSourceResponseHandler = (chunkSchema2) => async ({ response }) => {
      const responseHeaders = extractResponseHeaders(response);
      if (response.body == null) {
        throw new EmptyResponseBodyError({});
      }
      return {
        responseHeaders,
        value: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(createEventSourceParserStream()).pipeThrough(
          new TransformStream({
            transform({ data }, controller) {
              if (data === "[DONE]") {
                return;
              }
              controller.enqueue(
                safeParseJSON({
                  text: data,
                  schema: chunkSchema2
                })
              );
            }
          })
        )
      };
    };
    createJsonResponseHandler = (responseSchema2) => async ({ response, url, requestBodyValues }) => {
      const responseBody = await response.text();
      const parsedResult = safeParseJSON({
        text: responseBody,
        schema: responseSchema2
      });
      const responseHeaders = extractResponseHeaders(response);
      if (!parsedResult.success) {
        throw new APICallError({
          message: "Invalid JSON response",
          cause: parsedResult.error,
          statusCode: response.status,
          responseHeaders,
          responseBody,
          url,
          requestBodyValues
        });
      }
      return {
        responseHeaders,
        value: parsedResult.value,
        rawValue: parsedResult.rawValue
      };
    };
    createBinaryResponseHandler = () => async ({ response, url, requestBodyValues }) => {
      const responseHeaders = extractResponseHeaders(response);
      if (!response.body) {
        throw new APICallError({
          message: "Response body is empty",
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody: void 0
        });
      }
      try {
        const buffer = await response.arrayBuffer();
        return {
          responseHeaders,
          value: new Uint8Array(buffer)
        };
      } catch (error) {
        throw new APICallError({
          message: "Failed to read response as array buffer",
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody: void 0,
          cause: error
        });
      }
    };
    ({ btoa, atob: atob2 } = globalThis);
  }
});

// node_modules/@ai-sdk/anthropic/dist/index.mjs
var dist_exports = {};
__export(dist_exports, {
  anthropic: () => anthropic,
  createAnthropic: () => createAnthropic
});
function prepareTools(mode) {
  var _a17;
  const tools = ((_a17 = mode.tools) == null ? void 0 : _a17.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const betas = /* @__PURE__ */ new Set();
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings, betas };
  }
  const anthropicTools2 = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        anthropicTools2.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "anthropic.computer_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "computer_20250124",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.computer_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "computer_20241022",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.text_editor_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20250124"
            });
            break;
          case "anthropic.text_editor_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20241022"
            });
            break;
          case "anthropic.bash_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20250124"
            });
            break;
          case "anthropic.bash_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20241022"
            });
            break;
          default:
            toolWarnings.push({ type: "unsupported-tool", tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      tools: anthropicTools2,
      tool_choice: void 0,
      toolWarnings,
      betas
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "auto" },
        toolWarnings,
        betas
      };
    case "required":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "any" },
        toolWarnings,
        betas
      };
    case "none":
      return { tools: void 0, tool_choice: void 0, toolWarnings, betas };
    case "tool":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "tool", name: toolChoice.toolName },
        toolWarnings,
        betas
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings
}) {
  var _a17, _b, _c, _d;
  const betas = /* @__PURE__ */ new Set();
  const blocks = groupIntoBlocks(prompt);
  let system = void 0;
  const messages = [];
  function getCacheControl(providerMetadata) {
    var _a23;
    const anthropic2 = providerMetadata == null ? void 0 : providerMetadata.anthropic;
    const cacheControlValue = (_a23 = anthropic2 == null ? void 0 : anthropic2.cacheControl) != null ? _a23 : anthropic2 == null ? void 0 : anthropic2.cache_control;
    return cacheControlValue;
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "system": {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality: "Multiple system messages that are separated by user/assistant messages"
          });
        }
        system = block.messages.map(({ content, providerMetadata }) => ({
          type: "text",
          text: content,
          cache_control: getCacheControl(providerMetadata)
        }));
        break;
      }
      case "user": {
        const anthropicContent = [];
        for (const message of block.messages) {
          const { role, content } = message;
          switch (role) {
            case "user": {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                const isLastPart = j === content.length - 1;
                const cacheControl = (_a17 = getCacheControl(part.providerMetadata)) != null ? _a17 : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                switch (part.type) {
                  case "text": {
                    anthropicContent.push({
                      type: "text",
                      text: part.text,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "image": {
                    anthropicContent.push({
                      type: "image",
                      source: part.image instanceof URL ? {
                        type: "url",
                        url: part.image.toString()
                      } : {
                        type: "base64",
                        media_type: (_b = part.mimeType) != null ? _b : "image/jpeg",
                        data: convertUint8ArrayToBase64(part.image)
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "file": {
                    if (part.mimeType !== "application/pdf") {
                      throw new UnsupportedFunctionalityError({
                        functionality: "Non-PDF files in user messages"
                      });
                    }
                    betas.add("pdfs-2024-09-25");
                    anthropicContent.push({
                      type: "document",
                      source: part.data instanceof URL ? {
                        type: "url",
                        url: part.data.toString()
                      } : {
                        type: "base64",
                        media_type: "application/pdf",
                        data: part.data
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                }
              }
              break;
            }
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                const isLastPart = i2 === content.length - 1;
                const cacheControl = (_c = getCacheControl(part.providerMetadata)) != null ? _c : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                const toolResultContent = part.content != null ? part.content.map((part2) => {
                  var _a23;
                  switch (part2.type) {
                    case "text":
                      return {
                        type: "text",
                        text: part2.text,
                        cache_control: void 0
                      };
                    case "image":
                      return {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: (_a23 = part2.mimeType) != null ? _a23 : "image/jpeg",
                          data: part2.data
                        },
                        cache_control: void 0
                      };
                  }
                }) : JSON.stringify(part.result);
                anthropicContent.push({
                  type: "tool_result",
                  tool_use_id: part.toolCallId,
                  content: toolResultContent,
                  is_error: part.isError,
                  cache_control: cacheControl
                });
              }
              break;
            }
            default: {
              const _exhaustiveCheck = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
        }
        messages.push({ role: "user", content: anthropicContent });
        break;
      }
      case "assistant": {
        const anthropicContent = [];
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            const cacheControl = (_d = getCacheControl(part.providerMetadata)) != null ? _d : isLastContentPart ? getCacheControl(message.providerMetadata) : void 0;
            switch (part.type) {
              case "text": {
                anthropicContent.push({
                  type: "text",
                  text: (
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    isLastBlock && isLastMessage && isLastContentPart ? part.text.trim() : part.text
                  ),
                  cache_control: cacheControl
                });
                break;
              }
              case "reasoning": {
                if (sendReasoning) {
                  anthropicContent.push({
                    type: "thinking",
                    thinking: part.text,
                    signature: part.signature,
                    cache_control: cacheControl
                  });
                } else {
                  warnings.push({
                    type: "other",
                    message: "sending reasoning content is disabled for this model"
                  });
                }
                break;
              }
              case "redacted-reasoning": {
                anthropicContent.push({
                  type: "redacted_thinking",
                  data: part.data,
                  cache_control: cacheControl
                });
                break;
              }
              case "tool-call": {
                anthropicContent.push({
                  type: "tool_use",
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.args,
                  cache_control: cacheControl
                });
                break;
              }
            }
          }
        }
        messages.push({ role: "assistant", content: anthropicContent });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  return {
    prompt: { system, messages },
    betas
  };
}
function groupIntoBlocks(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { type: "system", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { type: "assistant", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}
function mapAnthropicStopReason(finishReason) {
  switch (finishReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool-calls";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}
function bashTool_20241022(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.bash_20241022",
    args: {},
    parameters: Bash20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function bashTool_20250124(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.bash_20250124",
    args: {},
    parameters: Bash20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function textEditorTool_20241022(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.text_editor_20241022",
    args: {},
    parameters: TextEditor20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function textEditorTool_20250124(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.text_editor_20250124",
    args: {},
    parameters: TextEditor20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function computerTool_20241022(options) {
  return {
    type: "provider-defined",
    id: "anthropic.computer_20241022",
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber
    },
    parameters: Computer20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function computerTool_20250124(options) {
  return {
    type: "provider-defined",
    id: "anthropic.computer_20250124",
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber
    },
    parameters: Computer20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
function createAnthropic(options = {}) {
  var _a17;
  const baseURL = (_a17 = withoutTrailingSlash(options.baseURL)) != null ? _a17 : "https://api.anthropic.com/v1";
  const getHeaders = () => ({
    "anthropic-version": "2023-06-01",
    "x-api-key": loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "ANTHROPIC_API_KEY",
      description: "Anthropic"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new AnthropicMessagesLanguageModel(modelId, settings, {
    provider: "anthropic.messages",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch,
    supportsImageUrls: true
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Anthropic model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.tools = anthropicTools;
  return provider;
}
var anthropicErrorDataSchema, anthropicFailedResponseHandler, AnthropicMessagesLanguageModel, anthropicMessagesResponseSchema, anthropicMessagesChunkSchema, anthropicProviderOptionsSchema, Bash20241022Parameters, Bash20250124Parameters, TextEditor20241022Parameters, TextEditor20250124Parameters, Computer20241022Parameters, Computer20250124Parameters, anthropicTools, anthropic;
var init_dist3 = __esm({
  "node_modules/@ai-sdk/anthropic/dist/index.mjs"() {
    init_dist();
    init_dist2();
    init_dist();
    init_dist2();
    init_zod();
    init_dist2();
    init_zod();
    init_dist();
    init_dist();
    init_dist2();
    init_zod();
    anthropicErrorDataSchema = external_exports.object({
      type: external_exports.literal("error"),
      error: external_exports.object({
        type: external_exports.string(),
        message: external_exports.string()
      })
    });
    anthropicFailedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: anthropicErrorDataSchema,
      errorToMessage: (data) => data.error.message
    });
    AnthropicMessagesLanguageModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.defaultObjectGenerationMode = "tool";
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      supportsUrl(url) {
        return url.protocol === "https:";
      }
      get provider() {
        return this.config.provider;
      }
      get supportsImageUrls() {
        return this.config.supportsImageUrls;
      }
      async getArgs({
        mode,
        prompt,
        maxTokens = 4096,
        // 4096: max model output tokens TODO update default in v5
        temperature,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        stopSequences,
        responseFormat,
        seed,
        providerMetadata: providerOptions
      }) {
        var _a17, _b, _c;
        const type = mode.type;
        const warnings = [];
        if (frequencyPenalty != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "frequencyPenalty"
          });
        }
        if (presencePenalty != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "presencePenalty"
          });
        }
        if (seed != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "seed"
          });
        }
        if (responseFormat != null && responseFormat.type !== "text") {
          warnings.push({
            type: "unsupported-setting",
            setting: "responseFormat",
            details: "JSON response format is not supported."
          });
        }
        const { prompt: messagesPrompt, betas: messagesBetas } = convertToAnthropicMessagesPrompt({
          prompt,
          sendReasoning: (_a17 = this.settings.sendReasoning) != null ? _a17 : true,
          warnings
        });
        const anthropicOptions = parseProviderOptions({
          provider: "anthropic",
          providerOptions,
          schema: anthropicProviderOptionsSchema
        });
        const isThinking = ((_b = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _b.type) === "enabled";
        const thinkingBudget = (_c = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _c.budgetTokens;
        const baseArgs = {
          // model id:
          model: this.modelId,
          // standardized settings:
          max_tokens: maxTokens,
          temperature,
          top_k: topK,
          top_p: topP,
          stop_sequences: stopSequences,
          // provider specific settings:
          ...isThinking && {
            thinking: { type: "enabled", budget_tokens: thinkingBudget }
          },
          // prompt:
          system: messagesPrompt.system,
          messages: messagesPrompt.messages
        };
        if (isThinking) {
          if (thinkingBudget == null) {
            throw new UnsupportedFunctionalityError({
              functionality: "thinking requires a budget"
            });
          }
          if (baseArgs.temperature != null) {
            baseArgs.temperature = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "temperature",
              details: "temperature is not supported when thinking is enabled"
            });
          }
          if (topK != null) {
            baseArgs.top_k = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "topK",
              details: "topK is not supported when thinking is enabled"
            });
          }
          if (topP != null) {
            baseArgs.top_p = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "topP",
              details: "topP is not supported when thinking is enabled"
            });
          }
          baseArgs.max_tokens = maxTokens + thinkingBudget;
        }
        switch (type) {
          case "regular": {
            const {
              tools,
              tool_choice,
              toolWarnings,
              betas: toolsBetas
            } = prepareTools(mode);
            return {
              args: { ...baseArgs, tools, tool_choice },
              warnings: [...warnings, ...toolWarnings],
              betas: /* @__PURE__ */ new Set([...messagesBetas, ...toolsBetas])
            };
          }
          case "object-json": {
            throw new UnsupportedFunctionalityError({
              functionality: "json-mode object generation"
            });
          }
          case "object-tool": {
            const { name: name17, description, parameters } = mode.tool;
            return {
              args: {
                ...baseArgs,
                tools: [{ name: name17, description, input_schema: parameters }],
                tool_choice: { type: "tool", name: name17 }
              },
              warnings,
              betas: messagesBetas
            };
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      async getHeaders({
        betas,
        headers: headers9
      }) {
        return combineHeaders(
          await resolve(this.config.headers),
          betas.size > 0 ? { "anthropic-beta": Array.from(betas).join(",") } : {},
          headers9
        );
      }
      buildRequestUrl(isStreaming) {
        var _a17, _b, _c;
        return (_c = (_b = (_a17 = this.config).buildRequestUrl) == null ? void 0 : _b.call(_a17, this.config.baseURL, isStreaming)) != null ? _c : `${this.config.baseURL}/messages`;
      }
      transformRequestBody(args) {
        var _a17, _b, _c;
        return (_c = (_b = (_a17 = this.config).transformRequestBody) == null ? void 0 : _b.call(_a17, args)) != null ? _c : args;
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d;
        const { args, warnings, betas } = await this.getArgs(options);
        const {
          responseHeaders,
          value: response,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: this.buildRequestUrl(false),
          headers: await this.getHeaders({ betas, headers: options.headers }),
          body: this.transformRequestBody(args),
          failedResponseHandler: anthropicFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            anthropicMessagesResponseSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = args;
        let text2 = "";
        for (const content of response.content) {
          if (content.type === "text") {
            text2 += content.text;
          }
        }
        let toolCalls = void 0;
        if (response.content.some((content) => content.type === "tool_use")) {
          toolCalls = [];
          for (const content of response.content) {
            if (content.type === "tool_use") {
              toolCalls.push({
                toolCallType: "function",
                toolCallId: content.id,
                toolName: content.name,
                args: JSON.stringify(content.input)
              });
            }
          }
        }
        const reasoning = response.content.filter(
          (content) => content.type === "redacted_thinking" || content.type === "thinking"
        ).map(
          (content) => content.type === "thinking" ? {
            type: "text",
            text: content.thinking,
            signature: content.signature
          } : {
            type: "redacted",
            data: content.data
          }
        );
        return {
          text: text2,
          reasoning: reasoning.length > 0 ? reasoning : void 0,
          toolCalls,
          finishReason: mapAnthropicStopReason(response.stop_reason),
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens
          },
          rawCall: { rawPrompt, rawSettings },
          rawResponse: {
            headers: responseHeaders,
            body: rawResponse
          },
          response: {
            id: (_a17 = response.id) != null ? _a17 : void 0,
            modelId: (_b = response.model) != null ? _b : void 0
          },
          warnings,
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: (_c = response.usage.cache_creation_input_tokens) != null ? _c : null,
              cacheReadInputTokens: (_d = response.usage.cache_read_input_tokens) != null ? _d : null
            }
          },
          request: { body: JSON.stringify(args) }
        };
      }
      async doStream(options) {
        const { args, warnings, betas } = await this.getArgs(options);
        const body = { ...args, stream: true };
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.buildRequestUrl(true),
          headers: await this.getHeaders({ betas, headers: options.headers }),
          body: this.transformRequestBody(body),
          failedResponseHandler: anthropicFailedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(
            anthropicMessagesChunkSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = args;
        let finishReason = "unknown";
        const usage = {
          promptTokens: Number.NaN,
          completionTokens: Number.NaN
        };
        const toolCallContentBlocks = {};
        let providerMetadata = void 0;
        let blockType = void 0;
        return {
          stream: response.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                var _a17, _b, _c, _d;
                if (!chunk.success) {
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                switch (value.type) {
                  case "ping": {
                    return;
                  }
                  case "content_block_start": {
                    const contentBlockType = value.content_block.type;
                    blockType = contentBlockType;
                    switch (contentBlockType) {
                      case "text":
                      case "thinking": {
                        return;
                      }
                      case "redacted_thinking": {
                        controller.enqueue({
                          type: "redacted-reasoning",
                          data: value.content_block.data
                        });
                        return;
                      }
                      case "tool_use": {
                        toolCallContentBlocks[value.index] = {
                          toolCallId: value.content_block.id,
                          toolName: value.content_block.name,
                          jsonText: ""
                        };
                        return;
                      }
                      default: {
                        const _exhaustiveCheck = contentBlockType;
                        throw new Error(
                          `Unsupported content block type: ${_exhaustiveCheck}`
                        );
                      }
                    }
                  }
                  case "content_block_stop": {
                    if (toolCallContentBlocks[value.index] != null) {
                      const contentBlock = toolCallContentBlocks[value.index];
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: contentBlock.toolCallId,
                        toolName: contentBlock.toolName,
                        args: contentBlock.jsonText
                      });
                      delete toolCallContentBlocks[value.index];
                    }
                    blockType = void 0;
                    return;
                  }
                  case "content_block_delta": {
                    const deltaType = value.delta.type;
                    switch (deltaType) {
                      case "text_delta": {
                        controller.enqueue({
                          type: "text-delta",
                          textDelta: value.delta.text
                        });
                        return;
                      }
                      case "thinking_delta": {
                        controller.enqueue({
                          type: "reasoning",
                          textDelta: value.delta.thinking
                        });
                        return;
                      }
                      case "signature_delta": {
                        if (blockType === "thinking") {
                          controller.enqueue({
                            type: "reasoning-signature",
                            signature: value.delta.signature
                          });
                        }
                        return;
                      }
                      case "input_json_delta": {
                        const contentBlock = toolCallContentBlocks[value.index];
                        controller.enqueue({
                          type: "tool-call-delta",
                          toolCallType: "function",
                          toolCallId: contentBlock.toolCallId,
                          toolName: contentBlock.toolName,
                          argsTextDelta: value.delta.partial_json
                        });
                        contentBlock.jsonText += value.delta.partial_json;
                        return;
                      }
                      default: {
                        const _exhaustiveCheck = deltaType;
                        throw new Error(
                          `Unsupported delta type: ${_exhaustiveCheck}`
                        );
                      }
                    }
                  }
                  case "message_start": {
                    usage.promptTokens = value.message.usage.input_tokens;
                    usage.completionTokens = value.message.usage.output_tokens;
                    providerMetadata = {
                      anthropic: {
                        cacheCreationInputTokens: (_a17 = value.message.usage.cache_creation_input_tokens) != null ? _a17 : null,
                        cacheReadInputTokens: (_b = value.message.usage.cache_read_input_tokens) != null ? _b : null
                      }
                    };
                    controller.enqueue({
                      type: "response-metadata",
                      id: (_c = value.message.id) != null ? _c : void 0,
                      modelId: (_d = value.message.model) != null ? _d : void 0
                    });
                    return;
                  }
                  case "message_delta": {
                    usage.completionTokens = value.usage.output_tokens;
                    finishReason = mapAnthropicStopReason(value.delta.stop_reason);
                    return;
                  }
                  case "message_stop": {
                    controller.enqueue({
                      type: "finish",
                      finishReason,
                      usage,
                      providerMetadata
                    });
                    return;
                  }
                  case "error": {
                    controller.enqueue({ type: "error", error: value.error });
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = value;
                    throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
                  }
                }
              }
            })
          ),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders },
          warnings,
          request: { body: JSON.stringify(body) }
        };
      }
    };
    anthropicMessagesResponseSchema = external_exports.object({
      type: external_exports.literal("message"),
      id: external_exports.string().nullish(),
      model: external_exports.string().nullish(),
      content: external_exports.array(
        external_exports.discriminatedUnion("type", [
          external_exports.object({
            type: external_exports.literal("text"),
            text: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("thinking"),
            thinking: external_exports.string(),
            signature: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("redacted_thinking"),
            data: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("tool_use"),
            id: external_exports.string(),
            name: external_exports.string(),
            input: external_exports.unknown()
          })
        ])
      ),
      stop_reason: external_exports.string().nullish(),
      usage: external_exports.object({
        input_tokens: external_exports.number(),
        output_tokens: external_exports.number(),
        cache_creation_input_tokens: external_exports.number().nullish(),
        cache_read_input_tokens: external_exports.number().nullish()
      })
    });
    anthropicMessagesChunkSchema = external_exports.discriminatedUnion("type", [
      external_exports.object({
        type: external_exports.literal("message_start"),
        message: external_exports.object({
          id: external_exports.string().nullish(),
          model: external_exports.string().nullish(),
          usage: external_exports.object({
            input_tokens: external_exports.number(),
            output_tokens: external_exports.number(),
            cache_creation_input_tokens: external_exports.number().nullish(),
            cache_read_input_tokens: external_exports.number().nullish()
          })
        })
      }),
      external_exports.object({
        type: external_exports.literal("content_block_start"),
        index: external_exports.number(),
        content_block: external_exports.discriminatedUnion("type", [
          external_exports.object({
            type: external_exports.literal("text"),
            text: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("thinking"),
            thinking: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("tool_use"),
            id: external_exports.string(),
            name: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("redacted_thinking"),
            data: external_exports.string()
          })
        ])
      }),
      external_exports.object({
        type: external_exports.literal("content_block_delta"),
        index: external_exports.number(),
        delta: external_exports.discriminatedUnion("type", [
          external_exports.object({
            type: external_exports.literal("input_json_delta"),
            partial_json: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("text_delta"),
            text: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("thinking_delta"),
            thinking: external_exports.string()
          }),
          external_exports.object({
            type: external_exports.literal("signature_delta"),
            signature: external_exports.string()
          })
        ])
      }),
      external_exports.object({
        type: external_exports.literal("content_block_stop"),
        index: external_exports.number()
      }),
      external_exports.object({
        type: external_exports.literal("error"),
        error: external_exports.object({
          type: external_exports.string(),
          message: external_exports.string()
        })
      }),
      external_exports.object({
        type: external_exports.literal("message_delta"),
        delta: external_exports.object({ stop_reason: external_exports.string().nullish() }),
        usage: external_exports.object({ output_tokens: external_exports.number() })
      }),
      external_exports.object({
        type: external_exports.literal("message_stop")
      }),
      external_exports.object({
        type: external_exports.literal("ping")
      })
    ]);
    anthropicProviderOptionsSchema = external_exports.object({
      thinking: external_exports.object({
        type: external_exports.union([external_exports.literal("enabled"), external_exports.literal("disabled")]),
        budgetTokens: external_exports.number().optional()
      }).optional()
    });
    Bash20241022Parameters = external_exports.object({
      command: external_exports.string(),
      restart: external_exports.boolean().optional()
    });
    Bash20250124Parameters = external_exports.object({
      command: external_exports.string(),
      restart: external_exports.boolean().optional()
    });
    TextEditor20241022Parameters = external_exports.object({
      command: external_exports.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
      path: external_exports.string(),
      file_text: external_exports.string().optional(),
      insert_line: external_exports.number().int().optional(),
      new_str: external_exports.string().optional(),
      old_str: external_exports.string().optional(),
      view_range: external_exports.array(external_exports.number().int()).optional()
    });
    TextEditor20250124Parameters = external_exports.object({
      command: external_exports.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
      path: external_exports.string(),
      file_text: external_exports.string().optional(),
      insert_line: external_exports.number().int().optional(),
      new_str: external_exports.string().optional(),
      old_str: external_exports.string().optional(),
      view_range: external_exports.array(external_exports.number().int()).optional()
    });
    Computer20241022Parameters = external_exports.object({
      action: external_exports.enum([
        "key",
        "type",
        "mouse_move",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "screenshot",
        "cursor_position"
      ]),
      coordinate: external_exports.array(external_exports.number().int()).optional(),
      text: external_exports.string().optional()
    });
    Computer20250124Parameters = external_exports.object({
      action: external_exports.enum([
        "key",
        "hold_key",
        "type",
        "cursor_position",
        "mouse_move",
        "left_mouse_down",
        "left_mouse_up",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "triple_click",
        "scroll",
        "wait",
        "screenshot"
      ]),
      coordinate: external_exports.tuple([external_exports.number().int(), external_exports.number().int()]).optional(),
      duration: external_exports.number().optional(),
      scroll_amount: external_exports.number().optional(),
      scroll_direction: external_exports.enum(["up", "down", "left", "right"]).optional(),
      start_coordinate: external_exports.tuple([external_exports.number().int(), external_exports.number().int()]).optional(),
      text: external_exports.string().optional()
    });
    anthropicTools = {
      bash_20241022: bashTool_20241022,
      bash_20250124: bashTool_20250124,
      textEditor_20241022: textEditorTool_20241022,
      textEditor_20250124: textEditorTool_20250124,
      computer_20241022: computerTool_20241022,
      computer_20250124: computerTool_20250124
    };
    anthropic = createAnthropic();
  }
});

// node_modules/@ai-sdk/openai/dist/index.mjs
var dist_exports2 = {};
__export(dist_exports2, {
  createOpenAI: () => createOpenAI,
  openai: () => openai
});
function convertToOpenAIChatMessages({
  prompt,
  useLegacyFunctionCalling = false,
  systemMessageMode = "system"
}) {
  const messages = [];
  const warnings = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        switch (systemMessageMode) {
          case "system": {
            messages.push({ role: "system", content });
            break;
          }
          case "developer": {
            messages.push({ role: "developer", content });
            break;
          }
          case "remove": {
            warnings.push({
              type: "other",
              message: "system messages are removed for this model"
            });
            break;
          }
          default: {
            const _exhaustiveCheck = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`
            );
          }
        }
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part, index) => {
            var _a17, _b, _c, _d;
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a17 = part.mimeType) != null ? _a17 : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`,
                    // OpenAI specific extension: image detail
                    detail: (_c = (_b = part.providerMetadata) == null ? void 0 : _b.openai) == null ? void 0 : _c.imageDetail
                  }
                };
              }
              case "file": {
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "'File content parts with URL data' functionality not supported."
                  });
                }
                switch (part.mimeType) {
                  case "audio/wav": {
                    return {
                      type: "input_audio",
                      input_audio: { data: part.data, format: "wav" }
                    };
                  }
                  case "audio/mp3":
                  case "audio/mpeg": {
                    return {
                      type: "input_audio",
                      input_audio: { data: part.data, format: "mp3" }
                    };
                  }
                  case "application/pdf": {
                    return {
                      type: "file",
                      file: {
                        filename: (_d = part.filename) != null ? _d : `part-${index}.pdf`,
                        file_data: `data:application/pdf;base64,${part.data}`
                      }
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError({
                      functionality: `File content part type ${part.mimeType} in user messages`
                    });
                  }
                }
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        let text2 = "";
        const toolCalls = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              text2 += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args)
                }
              });
              break;
            }
          }
        }
        if (useLegacyFunctionCalling) {
          if (toolCalls.length > 1) {
            throw new UnsupportedFunctionalityError({
              functionality: "useLegacyFunctionCalling with multiple tool calls in one message"
            });
          }
          messages.push({
            role: "assistant",
            content: text2,
            function_call: toolCalls.length > 0 ? toolCalls[0].function : void 0
          });
        } else {
          messages.push({
            role: "assistant",
            content: text2,
            tool_calls: toolCalls.length > 0 ? toolCalls : void 0
          });
        }
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          if (useLegacyFunctionCalling) {
            messages.push({
              role: "function",
              name: toolResponse.toolName,
              content: JSON.stringify(toolResponse.result)
            });
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolResponse.toolCallId,
              content: JSON.stringify(toolResponse.result)
            });
          }
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}
function mapOpenAIChatLogProbsOutput(logprobs) {
  var _a17, _b;
  return (_b = (_a17 = logprobs == null ? void 0 : logprobs.content) == null ? void 0 : _a17.map(({ token, logprob, top_logprobs }) => ({
    token,
    logprob,
    topLogprobs: top_logprobs ? top_logprobs.map(({ token: token2, logprob: logprob2 }) => ({
      token: token2,
      logprob: logprob2
    })) : []
  }))) != null ? _b : void 0;
}
function mapOpenAIFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
function getResponseMetadata({
  id,
  model,
  created
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function prepareTools2({
  mode,
  useLegacyFunctionCalling = false,
  structuredOutputs
}) {
  var _a17;
  const tools = ((_a17 = mode.tools) == null ? void 0 : _a17.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  if (useLegacyFunctionCalling) {
    const openaiFunctions = [];
    for (const tool of tools) {
      if (tool.type === "provider-defined") {
        toolWarnings.push({ type: "unsupported-tool", tool });
      } else {
        openaiFunctions.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        });
      }
    }
    if (toolChoice == null) {
      return {
        functions: openaiFunctions,
        function_call: void 0,
        toolWarnings
      };
    }
    const type2 = toolChoice.type;
    switch (type2) {
      case "auto":
      case "none":
      case void 0:
        return {
          functions: openaiFunctions,
          function_call: void 0,
          toolWarnings
        };
      case "required":
        throw new UnsupportedFunctionalityError({
          functionality: "useLegacyFunctionCalling and toolChoice: required"
        });
      default:
        return {
          functions: openaiFunctions,
          function_call: { name: toolChoice.toolName },
          toolWarnings
        };
    }
  }
  const openaiTools2 = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      openaiTools2.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: structuredOutputs ? true : void 0
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: openaiTools2, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiTools2, tool_choice: type, toolWarnings };
    case "tool":
      return {
        tools: openaiTools2,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function isReasoningModel(modelId) {
  return modelId.startsWith("o") || modelId.startsWith("gpt-5");
}
function isAudioModel(modelId) {
  return modelId.startsWith("gpt-4o-audio-preview");
}
function getSystemMessageMode(modelId) {
  var _a17, _b;
  if (!isReasoningModel(modelId)) {
    return "system";
  }
  return (_b = (_a17 = reasoningModels[modelId]) == null ? void 0 : _a17.systemMessageMode) != null ? _b : "developer";
}
function convertToOpenAICompletionPrompt({
  prompt,
  inputFormat,
  user = "user",
  assistant = "assistant"
}) {
  if (inputFormat === "prompt" && prompt.length === 1 && prompt[0].role === "user" && prompt[0].content.length === 1 && prompt[0].content[0].type === "text") {
    return { prompt: prompt[0].content[0].text };
  }
  let text2 = "";
  if (prompt[0].role === "system") {
    text2 += `${prompt[0].content}

`;
    prompt = prompt.slice(1);
  }
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        throw new InvalidPromptError({
          message: "Unexpected system message in prompt: ${content}",
          prompt
        });
      }
      case "user": {
        const userMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "image": {
              throw new UnsupportedFunctionalityError({
                functionality: "images"
              });
            }
          }
        }).join("");
        text2 += `${user}:
${userMessage}

`;
        break;
      }
      case "assistant": {
        const assistantMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "tool-call": {
              throw new UnsupportedFunctionalityError({
                functionality: "tool-call messages"
              });
            }
          }
        }).join("");
        text2 += `${assistant}:
${assistantMessage}

`;
        break;
      }
      case "tool": {
        throw new UnsupportedFunctionalityError({
          functionality: "tool messages"
        });
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  text2 += `${assistant}:
`;
  return {
    prompt: text2,
    stopSequences: [`
${user}:`]
  };
}
function mapOpenAICompletionLogProbs(logprobs) {
  return logprobs == null ? void 0 : logprobs.tokens.map((token, index) => ({
    token,
    logprob: logprobs.token_logprobs[index],
    topLogprobs: logprobs.top_logprobs ? Object.entries(logprobs.top_logprobs[index]).map(
      ([token2, logprob]) => ({
        token: token2,
        logprob
      })
    ) : []
  }));
}
function convertToOpenAIResponsesMessages({
  prompt,
  systemMessageMode
}) {
  const messages = [];
  const warnings = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        switch (systemMessageMode) {
          case "system": {
            messages.push({ role: "system", content });
            break;
          }
          case "developer": {
            messages.push({ role: "developer", content });
            break;
          }
          case "remove": {
            warnings.push({
              type: "other",
              message: "system messages are removed for this model"
            });
            break;
          }
          default: {
            const _exhaustiveCheck = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`
            );
          }
        }
        break;
      }
      case "user": {
        messages.push({
          role: "user",
          content: content.map((part, index) => {
            var _a17, _b, _c, _d;
            switch (part.type) {
              case "text": {
                return { type: "input_text", text: part.text };
              }
              case "image": {
                return {
                  type: "input_image",
                  image_url: part.image instanceof URL ? part.image.toString() : `data:${(_a17 = part.mimeType) != null ? _a17 : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`,
                  // OpenAI specific extension: image detail
                  detail: (_c = (_b = part.providerMetadata) == null ? void 0 : _b.openai) == null ? void 0 : _c.imageDetail
                };
              }
              case "file": {
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "File URLs in user messages"
                  });
                }
                switch (part.mimeType) {
                  case "application/pdf": {
                    return {
                      type: "input_file",
                      filename: (_d = part.filename) != null ? _d : `part-${index}.pdf`,
                      file_data: `data:application/pdf;base64,${part.data}`
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError({
                      functionality: "Only PDF files are supported in user messages"
                    });
                  }
                }
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        for (const part of content) {
          switch (part.type) {
            case "text": {
              messages.push({
                role: "assistant",
                content: [{ type: "output_text", text: part.text }]
              });
              break;
            }
            case "tool-call": {
              messages.push({
                type: "function_call",
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.args)
              });
              break;
            }
          }
        }
        break;
      }
      case "tool": {
        for (const part of content) {
          messages.push({
            type: "function_call_output",
            call_id: part.toolCallId,
            output: JSON.stringify(part.result)
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}
function mapOpenAIResponseFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case void 0:
    case null:
      return hasToolCalls ? "tool-calls" : "stop";
    case "max_output_tokens":
      return "length";
    case "content_filter":
      return "content-filter";
    default:
      return hasToolCalls ? "tool-calls" : "unknown";
  }
}
function prepareResponsesTools({
  mode,
  strict
}) {
  var _a17;
  const tools = ((_a17 = mode.tools) == null ? void 0 : _a17.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const openaiTools2 = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        openaiTools2.push({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: strict ? true : void 0
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "openai.web_search_preview":
            openaiTools2.push({
              type: "web_search_preview",
              search_context_size: tool.args.searchContextSize,
              user_location: tool.args.userLocation
            });
            break;
          default:
            toolWarnings.push({ type: "unsupported-tool", tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  if (toolChoice == null) {
    return { tools: openaiTools2, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiTools2, tool_choice: type, toolWarnings };
    case "tool": {
      if (toolChoice.toolName === "web_search_preview") {
        return {
          tools: openaiTools2,
          tool_choice: {
            type: "web_search_preview"
          },
          toolWarnings
        };
      }
      return {
        tools: openaiTools2,
        tool_choice: {
          type: "function",
          name: toolChoice.toolName
        },
        toolWarnings
      };
    }
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function isTextDeltaChunk(chunk) {
  return chunk.type === "response.output_text.delta";
}
function isResponseOutputItemDoneChunk(chunk) {
  return chunk.type === "response.output_item.done";
}
function isResponseFinishedChunk(chunk) {
  return chunk.type === "response.completed" || chunk.type === "response.incomplete";
}
function isResponseCreatedChunk(chunk) {
  return chunk.type === "response.created";
}
function isResponseFunctionCallArgumentsDeltaChunk(chunk) {
  return chunk.type === "response.function_call_arguments.delta";
}
function isResponseOutputItemAddedChunk(chunk) {
  return chunk.type === "response.output_item.added";
}
function isResponseAnnotationAddedChunk(chunk) {
  return chunk.type === "response.output_text.annotation.added";
}
function isResponseReasoningSummaryTextDeltaChunk(chunk) {
  return chunk.type === "response.reasoning_summary_text.delta";
}
function isErrorChunk(chunk) {
  return chunk.type === "error";
}
function getResponsesModelConfig(modelId) {
  if (modelId.startsWith("o") || modelId.startsWith("gpt-5")) {
    if (modelId.startsWith("o1-mini") || modelId.startsWith("o1-preview")) {
      return {
        isReasoningModel: true,
        systemMessageMode: "remove",
        requiredAutoTruncation: false
      };
    }
    return {
      isReasoningModel: true,
      systemMessageMode: "developer",
      requiredAutoTruncation: false
    };
  }
  return {
    isReasoningModel: false,
    systemMessageMode: "system",
    requiredAutoTruncation: false
  };
}
function webSearchPreviewTool({
  searchContextSize,
  userLocation
} = {}) {
  return {
    type: "provider-defined",
    id: "openai.web_search_preview",
    args: {
      searchContextSize,
      userLocation
    },
    parameters: WebSearchPreviewParameters
  };
}
function createOpenAI(options = {}) {
  var _a17, _b, _c;
  const baseURL = (_a17 = withoutTrailingSlash(options.baseURL)) != null ? _a17 : "https://api.openai.com/v1";
  const compatibility = (_b = options.compatibility) != null ? _b : "compatible";
  const providerName = (_c = options.name) != null ? _c : "openai";
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "OPENAI_API_KEY",
      description: "OpenAI"
    })}`,
    "OpenAI-Organization": options.organization,
    "OpenAI-Project": options.project,
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new OpenAIChatLanguageModel(modelId, settings, {
    provider: `${providerName}.chat`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch
  });
  const createCompletionModel = (modelId, settings = {}) => new OpenAICompletionLanguageModel(modelId, settings, {
    provider: `${providerName}.completion`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch
  });
  const createEmbeddingModel = (modelId, settings = {}) => new OpenAIEmbeddingModel(modelId, settings, {
    provider: `${providerName}.embedding`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createImageModel = (modelId, settings = {}) => new OpenAIImageModel(modelId, settings, {
    provider: `${providerName}.image`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createTranscriptionModel = (modelId) => new OpenAITranscriptionModel(modelId, {
    provider: `${providerName}.transcription`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createSpeechModel = (modelId) => new OpenAISpeechModel(modelId, {
    provider: `${providerName}.speech`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createLanguageModel = (modelId, settings) => {
    if (new.target) {
      throw new Error(
        "The OpenAI model function cannot be called with the new keyword."
      );
    }
    if (modelId === "gpt-3.5-turbo-instruct") {
      return createCompletionModel(
        modelId,
        settings
      );
    }
    return createChatModel(modelId, settings);
  };
  const createResponsesModel = (modelId) => {
    return new OpenAIResponsesLanguageModel(modelId, {
      provider: `${providerName}.responses`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    });
  };
  const provider = function(modelId, settings) {
    return createLanguageModel(modelId, settings);
  };
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  provider.responses = createResponsesModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.tools = openaiTools;
  return provider;
}
var openaiErrorDataSchema, openaiFailedResponseHandler, OpenAIChatLanguageModel, openaiTokenUsageSchema, openaiChatResponseSchema, openaiChatChunkSchema, reasoningModels, OpenAICompletionLanguageModel, openaiCompletionResponseSchema, openaiCompletionChunkSchema, OpenAIEmbeddingModel, openaiTextEmbeddingResponseSchema, modelMaxImagesPerCall, hasDefaultResponseFormat, OpenAIImageModel, openaiImageResponseSchema, openAIProviderOptionsSchema, languageMap, OpenAITranscriptionModel, openaiTranscriptionResponseSchema, OpenAIResponsesLanguageModel, usageSchema, textDeltaChunkSchema, responseFinishedChunkSchema, responseCreatedChunkSchema, responseOutputItemDoneSchema, responseFunctionCallArgumentsDeltaSchema, responseOutputItemAddedSchema, responseAnnotationAddedSchema, responseReasoningSummaryTextDeltaSchema, errorChunkSchema, openaiResponsesChunkSchema, openaiResponsesProviderOptionsSchema, WebSearchPreviewParameters, openaiTools, OpenAIProviderOptionsSchema, OpenAISpeechModel, openai;
var init_dist4 = __esm({
  "node_modules/@ai-sdk/openai/dist/index.mjs"() {
    init_dist2();
    init_dist();
    init_dist2();
    init_zod();
    init_dist();
    init_dist2();
    init_zod();
    init_dist2();
    init_dist();
    init_dist();
    init_dist2();
    init_zod();
    init_dist();
    init_dist();
    init_dist2();
    init_zod();
    init_dist2();
    init_zod();
    init_dist2();
    init_zod();
    init_dist();
    init_dist2();
    init_zod();
    init_dist();
    init_dist2();
    init_dist();
    init_zod();
    init_dist2();
    init_zod();
    openaiErrorDataSchema = external_exports.object({
      error: external_exports.object({
        message: external_exports.string(),
        // The additional information below is handled loosely to support
        // OpenAI-compatible providers that have slightly different error
        // responses:
        type: external_exports.string().nullish(),
        param: external_exports.any().nullish(),
        code: external_exports.union([external_exports.string(), external_exports.number()]).nullish()
      })
    });
    openaiFailedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: openaiErrorDataSchema,
      errorToMessage: (data) => data.error.message
    });
    OpenAIChatLanguageModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      get supportsStructuredOutputs() {
        var _a17;
        return (_a17 = this.settings.structuredOutputs) != null ? _a17 : isReasoningModel(this.modelId);
      }
      get defaultObjectGenerationMode() {
        if (isAudioModel(this.modelId)) {
          return "tool";
        }
        return this.supportsStructuredOutputs ? "json" : "tool";
      }
      get provider() {
        return this.config.provider;
      }
      get supportsImageUrls() {
        return !this.settings.downloadImages;
      }
      getArgs({
        mode,
        prompt,
        maxTokens,
        temperature,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        stopSequences,
        responseFormat,
        seed,
        providerMetadata
      }) {
        var _a17, _b, _c, _d, _e, _f, _g, _h;
        const type = mode.type;
        const warnings = [];
        if (topK != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "topK"
          });
        }
        if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
          warnings.push({
            type: "unsupported-setting",
            setting: "responseFormat",
            details: "JSON response format schema is only supported with structuredOutputs"
          });
        }
        const useLegacyFunctionCalling = this.settings.useLegacyFunctionCalling;
        if (useLegacyFunctionCalling && this.settings.parallelToolCalls === true) {
          throw new UnsupportedFunctionalityError({
            functionality: "useLegacyFunctionCalling with parallelToolCalls"
          });
        }
        if (useLegacyFunctionCalling && this.supportsStructuredOutputs) {
          throw new UnsupportedFunctionalityError({
            functionality: "structuredOutputs with useLegacyFunctionCalling"
          });
        }
        const { messages, warnings: messageWarnings } = convertToOpenAIChatMessages(
          {
            prompt,
            useLegacyFunctionCalling,
            systemMessageMode: getSystemMessageMode(this.modelId)
          }
        );
        warnings.push(...messageWarnings);
        const baseArgs = {
          // model id:
          model: this.modelId,
          // model specific settings:
          logit_bias: this.settings.logitBias,
          logprobs: this.settings.logprobs === true || typeof this.settings.logprobs === "number" ? true : void 0,
          top_logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
          user: this.settings.user,
          parallel_tool_calls: this.settings.parallelToolCalls,
          // standardized settings:
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
          response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? this.supportsStructuredOutputs && responseFormat.schema != null ? {
            type: "json_schema",
            json_schema: {
              schema: responseFormat.schema,
              strict: true,
              name: (_a17 = responseFormat.name) != null ? _a17 : "response",
              description: responseFormat.description
            }
          } : { type: "json_object" } : void 0,
          stop: stopSequences,
          seed,
          // openai specific settings:
          // TODO remove in next major version; we auto-map maxTokens now
          max_completion_tokens: (_b = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _b.maxCompletionTokens,
          store: (_c = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _c.store,
          metadata: (_d = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _d.metadata,
          prediction: (_e = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _e.prediction,
          reasoning_effort: (_g = (_f = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _f.reasoningEffort) != null ? _g : this.settings.reasoningEffort,
          // messages:
          messages
        };
        if (isReasoningModel(this.modelId)) {
          if (baseArgs.temperature != null) {
            baseArgs.temperature = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "temperature",
              details: "temperature is not supported for reasoning models"
            });
          }
          if (baseArgs.top_p != null) {
            baseArgs.top_p = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "topP",
              details: "topP is not supported for reasoning models"
            });
          }
          if (baseArgs.frequency_penalty != null) {
            baseArgs.frequency_penalty = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "frequencyPenalty",
              details: "frequencyPenalty is not supported for reasoning models"
            });
          }
          if (baseArgs.presence_penalty != null) {
            baseArgs.presence_penalty = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "presencePenalty",
              details: "presencePenalty is not supported for reasoning models"
            });
          }
          if (baseArgs.logit_bias != null) {
            baseArgs.logit_bias = void 0;
            warnings.push({
              type: "other",
              message: "logitBias is not supported for reasoning models"
            });
          }
          if (baseArgs.logprobs != null) {
            baseArgs.logprobs = void 0;
            warnings.push({
              type: "other",
              message: "logprobs is not supported for reasoning models"
            });
          }
          if (baseArgs.top_logprobs != null) {
            baseArgs.top_logprobs = void 0;
            warnings.push({
              type: "other",
              message: "topLogprobs is not supported for reasoning models"
            });
          }
          if (baseArgs.max_tokens != null) {
            if (baseArgs.max_completion_tokens == null) {
              baseArgs.max_completion_tokens = baseArgs.max_tokens;
            }
            baseArgs.max_tokens = void 0;
          }
        } else if (this.modelId.startsWith("gpt-4o-search-preview") || this.modelId.startsWith("gpt-4o-mini-search-preview")) {
          if (baseArgs.temperature != null) {
            baseArgs.temperature = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "temperature",
              details: "temperature is not supported for the search preview models and has been removed."
            });
          }
        }
        switch (type) {
          case "regular": {
            const { tools, tool_choice, functions, function_call, toolWarnings } = prepareTools2({
              mode,
              useLegacyFunctionCalling,
              structuredOutputs: this.supportsStructuredOutputs
            });
            return {
              args: {
                ...baseArgs,
                tools,
                tool_choice,
                functions,
                function_call
              },
              warnings: [...warnings, ...toolWarnings]
            };
          }
          case "object-json": {
            return {
              args: {
                ...baseArgs,
                response_format: this.supportsStructuredOutputs && mode.schema != null ? {
                  type: "json_schema",
                  json_schema: {
                    schema: mode.schema,
                    strict: true,
                    name: (_h = mode.name) != null ? _h : "response",
                    description: mode.description
                  }
                } : { type: "json_object" }
              },
              warnings
            };
          }
          case "object-tool": {
            return {
              args: useLegacyFunctionCalling ? {
                ...baseArgs,
                function_call: {
                  name: mode.tool.name
                },
                functions: [
                  {
                    name: mode.tool.name,
                    description: mode.tool.description,
                    parameters: mode.tool.parameters
                  }
                ]
              } : {
                ...baseArgs,
                tool_choice: {
                  type: "function",
                  function: { name: mode.tool.name }
                },
                tools: [
                  {
                    type: "function",
                    function: {
                      name: mode.tool.name,
                      description: mode.tool.description,
                      parameters: mode.tool.parameters,
                      strict: this.supportsStructuredOutputs ? true : void 0
                    }
                  }
                ]
              },
              warnings
            };
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d, _e, _f, _g, _h;
        const { args: body, warnings } = this.getArgs(options);
        const {
          responseHeaders,
          value: response,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: this.config.url({
            path: "/chat/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            openaiChatResponseSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = body;
        const choice = response.choices[0];
        const completionTokenDetails = (_a17 = response.usage) == null ? void 0 : _a17.completion_tokens_details;
        const promptTokenDetails = (_b = response.usage) == null ? void 0 : _b.prompt_tokens_details;
        const providerMetadata = { openai: {} };
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens) != null) {
          providerMetadata.openai.reasoningTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens;
        }
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens) != null) {
          providerMetadata.openai.acceptedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens;
        }
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens) != null) {
          providerMetadata.openai.rejectedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens;
        }
        if ((promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens) != null) {
          providerMetadata.openai.cachedPromptTokens = promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens;
        }
        return {
          text: (_c = choice.message.content) != null ? _c : void 0,
          toolCalls: this.settings.useLegacyFunctionCalling && choice.message.function_call ? [
            {
              toolCallType: "function",
              toolCallId: generateId(),
              toolName: choice.message.function_call.name,
              args: choice.message.function_call.arguments
            }
          ] : (_d = choice.message.tool_calls) == null ? void 0 : _d.map((toolCall) => {
            var _a23;
            return {
              toolCallType: "function",
              toolCallId: (_a23 = toolCall.id) != null ? _a23 : generateId(),
              toolName: toolCall.function.name,
              args: toolCall.function.arguments
            };
          }),
          finishReason: mapOpenAIFinishReason(choice.finish_reason),
          usage: {
            promptTokens: (_f = (_e = response.usage) == null ? void 0 : _e.prompt_tokens) != null ? _f : NaN,
            completionTokens: (_h = (_g = response.usage) == null ? void 0 : _g.completion_tokens) != null ? _h : NaN
          },
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders, body: rawResponse },
          request: { body: JSON.stringify(body) },
          response: getResponseMetadata(response),
          warnings,
          logprobs: mapOpenAIChatLogProbsOutput(choice.logprobs),
          providerMetadata
        };
      }
      async doStream(options) {
        if (this.settings.simulateStreaming) {
          const result = await this.doGenerate(options);
          const simulatedStream = new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "response-metadata", ...result.response });
              if (result.text) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: result.text
                });
              }
              if (result.toolCalls) {
                for (const toolCall of result.toolCalls) {
                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args
                  });
                  controller.enqueue({
                    type: "tool-call",
                    ...toolCall
                  });
                }
              }
              controller.enqueue({
                type: "finish",
                finishReason: result.finishReason,
                usage: result.usage,
                logprobs: result.logprobs,
                providerMetadata: result.providerMetadata
              });
              controller.close();
            }
          });
          return {
            stream: simulatedStream,
            rawCall: result.rawCall,
            rawResponse: result.rawResponse,
            warnings: result.warnings
          };
        }
        const { args, warnings } = this.getArgs(options);
        const body = {
          ...args,
          stream: true,
          // only include stream_options when in strict compatibility mode:
          stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
        };
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.config.url({
            path: "/chat/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(
            openaiChatChunkSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = args;
        const toolCalls = [];
        let finishReason = "unknown";
        let usage = {
          promptTokens: void 0,
          completionTokens: void 0
        };
        let logprobs;
        let isFirstChunk = true;
        const { useLegacyFunctionCalling } = this.settings;
        const providerMetadata = { openai: {} };
        return {
          stream: response.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                var _a17, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
                if (!chunk.success) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                if ("error" in value) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: value.error });
                  return;
                }
                if (isFirstChunk) {
                  isFirstChunk = false;
                  controller.enqueue({
                    type: "response-metadata",
                    ...getResponseMetadata(value)
                  });
                }
                if (value.usage != null) {
                  const {
                    prompt_tokens,
                    completion_tokens,
                    prompt_tokens_details,
                    completion_tokens_details
                  } = value.usage;
                  usage = {
                    promptTokens: prompt_tokens != null ? prompt_tokens : void 0,
                    completionTokens: completion_tokens != null ? completion_tokens : void 0
                  };
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens) != null) {
                    providerMetadata.openai.reasoningTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens;
                  }
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens) != null) {
                    providerMetadata.openai.acceptedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens;
                  }
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens) != null) {
                    providerMetadata.openai.rejectedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens;
                  }
                  if ((prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens) != null) {
                    providerMetadata.openai.cachedPromptTokens = prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens;
                  }
                }
                const choice = value.choices[0];
                if ((choice == null ? void 0 : choice.finish_reason) != null) {
                  finishReason = mapOpenAIFinishReason(choice.finish_reason);
                }
                if ((choice == null ? void 0 : choice.delta) == null) {
                  return;
                }
                const delta = choice.delta;
                if (delta.content != null) {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: delta.content
                  });
                }
                const mappedLogprobs = mapOpenAIChatLogProbsOutput(
                  choice == null ? void 0 : choice.logprobs
                );
                if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
                  if (logprobs === void 0) logprobs = [];
                  logprobs.push(...mappedLogprobs);
                }
                const mappedToolCalls = useLegacyFunctionCalling && delta.function_call != null ? [
                  {
                    type: "function",
                    id: generateId(),
                    function: delta.function_call,
                    index: 0
                  }
                ] : delta.tool_calls;
                if (mappedToolCalls != null) {
                  for (const toolCallDelta of mappedToolCalls) {
                    const index = toolCallDelta.index;
                    if (toolCalls[index] == null) {
                      if (toolCallDelta.type !== "function") {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'function' type.`
                        });
                      }
                      if (toolCallDelta.id == null) {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'id' to be a string.`
                        });
                      }
                      if (((_a17 = toolCallDelta.function) == null ? void 0 : _a17.name) == null) {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'function.name' to be a string.`
                        });
                      }
                      toolCalls[index] = {
                        id: toolCallDelta.id,
                        type: "function",
                        function: {
                          name: toolCallDelta.function.name,
                          arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                        },
                        hasFinished: false
                      };
                      const toolCall2 = toolCalls[index];
                      if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null) {
                        if (toolCall2.function.arguments.length > 0) {
                          controller.enqueue({
                            type: "tool-call-delta",
                            toolCallType: "function",
                            toolCallId: toolCall2.id,
                            toolName: toolCall2.function.name,
                            argsTextDelta: toolCall2.function.arguments
                          });
                        }
                        if (isParsableJson(toolCall2.function.arguments)) {
                          controller.enqueue({
                            type: "tool-call",
                            toolCallType: "function",
                            toolCallId: (_e = toolCall2.id) != null ? _e : generateId(),
                            toolName: toolCall2.function.name,
                            args: toolCall2.function.arguments
                          });
                          toolCall2.hasFinished = true;
                        }
                      }
                      continue;
                    }
                    const toolCall = toolCalls[index];
                    if (toolCall.hasFinished) {
                      continue;
                    }
                    if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                      toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                    }
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : ""
                    });
                    if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: (_l = toolCall.id) != null ? _l : generateId(),
                        toolName: toolCall.function.name,
                        args: toolCall.function.arguments
                      });
                      toolCall.hasFinished = true;
                    }
                  }
                }
              },
              flush(controller) {
                var _a17, _b;
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  logprobs,
                  usage: {
                    promptTokens: (_a17 = usage.promptTokens) != null ? _a17 : NaN,
                    completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
                  },
                  ...providerMetadata != null ? { providerMetadata } : {}
                });
              }
            })
          ),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders },
          request: { body: JSON.stringify(body) },
          warnings
        };
      }
    };
    openaiTokenUsageSchema = external_exports.object({
      prompt_tokens: external_exports.number().nullish(),
      completion_tokens: external_exports.number().nullish(),
      prompt_tokens_details: external_exports.object({
        cached_tokens: external_exports.number().nullish()
      }).nullish(),
      completion_tokens_details: external_exports.object({
        reasoning_tokens: external_exports.number().nullish(),
        accepted_prediction_tokens: external_exports.number().nullish(),
        rejected_prediction_tokens: external_exports.number().nullish()
      }).nullish()
    }).nullish();
    openaiChatResponseSchema = external_exports.object({
      id: external_exports.string().nullish(),
      created: external_exports.number().nullish(),
      model: external_exports.string().nullish(),
      choices: external_exports.array(
        external_exports.object({
          message: external_exports.object({
            role: external_exports.literal("assistant").nullish(),
            content: external_exports.string().nullish(),
            function_call: external_exports.object({
              arguments: external_exports.string(),
              name: external_exports.string()
            }).nullish(),
            tool_calls: external_exports.array(
              external_exports.object({
                id: external_exports.string().nullish(),
                type: external_exports.literal("function"),
                function: external_exports.object({
                  name: external_exports.string(),
                  arguments: external_exports.string()
                })
              })
            ).nullish()
          }),
          index: external_exports.number(),
          logprobs: external_exports.object({
            content: external_exports.array(
              external_exports.object({
                token: external_exports.string(),
                logprob: external_exports.number(),
                top_logprobs: external_exports.array(
                  external_exports.object({
                    token: external_exports.string(),
                    logprob: external_exports.number()
                  })
                )
              })
            ).nullable()
          }).nullish(),
          finish_reason: external_exports.string().nullish()
        })
      ),
      usage: openaiTokenUsageSchema
    });
    openaiChatChunkSchema = external_exports.union([
      external_exports.object({
        id: external_exports.string().nullish(),
        created: external_exports.number().nullish(),
        model: external_exports.string().nullish(),
        choices: external_exports.array(
          external_exports.object({
            delta: external_exports.object({
              role: external_exports.enum(["assistant"]).nullish(),
              content: external_exports.string().nullish(),
              function_call: external_exports.object({
                name: external_exports.string().optional(),
                arguments: external_exports.string().optional()
              }).nullish(),
              tool_calls: external_exports.array(
                external_exports.object({
                  index: external_exports.number(),
                  id: external_exports.string().nullish(),
                  type: external_exports.literal("function").nullish(),
                  function: external_exports.object({
                    name: external_exports.string().nullish(),
                    arguments: external_exports.string().nullish()
                  })
                })
              ).nullish()
            }).nullish(),
            logprobs: external_exports.object({
              content: external_exports.array(
                external_exports.object({
                  token: external_exports.string(),
                  logprob: external_exports.number(),
                  top_logprobs: external_exports.array(
                    external_exports.object({
                      token: external_exports.string(),
                      logprob: external_exports.number()
                    })
                  )
                })
              ).nullable()
            }).nullish(),
            finish_reason: external_exports.string().nullish(),
            index: external_exports.number()
          })
        ),
        usage: openaiTokenUsageSchema
      }),
      openaiErrorDataSchema
    ]);
    reasoningModels = {
      "o1-mini": {
        systemMessageMode: "remove"
      },
      "o1-mini-2024-09-12": {
        systemMessageMode: "remove"
      },
      "o1-preview": {
        systemMessageMode: "remove"
      },
      "o1-preview-2024-09-12": {
        systemMessageMode: "remove"
      },
      o3: {
        systemMessageMode: "developer"
      },
      "o3-2025-04-16": {
        systemMessageMode: "developer"
      },
      "o3-mini": {
        systemMessageMode: "developer"
      },
      "o3-mini-2025-01-31": {
        systemMessageMode: "developer"
      },
      "o4-mini": {
        systemMessageMode: "developer"
      },
      "o4-mini-2025-04-16": {
        systemMessageMode: "developer"
      }
    };
    OpenAICompletionLanguageModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.defaultObjectGenerationMode = void 0;
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      get provider() {
        return this.config.provider;
      }
      getArgs({
        mode,
        inputFormat,
        prompt,
        maxTokens,
        temperature,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        stopSequences: userStopSequences,
        responseFormat,
        seed
      }) {
        var _a17;
        const type = mode.type;
        const warnings = [];
        if (topK != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "topK"
          });
        }
        if (responseFormat != null && responseFormat.type !== "text") {
          warnings.push({
            type: "unsupported-setting",
            setting: "responseFormat",
            details: "JSON response format is not supported."
          });
        }
        const { prompt: completionPrompt, stopSequences } = convertToOpenAICompletionPrompt({ prompt, inputFormat });
        const stop = [...stopSequences != null ? stopSequences : [], ...userStopSequences != null ? userStopSequences : []];
        const baseArgs = {
          // model id:
          model: this.modelId,
          // model specific settings:
          echo: this.settings.echo,
          logit_bias: this.settings.logitBias,
          logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
          suffix: this.settings.suffix,
          user: this.settings.user,
          // standardized settings:
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
          seed,
          // prompt:
          prompt: completionPrompt,
          // stop sequences:
          stop: stop.length > 0 ? stop : void 0
        };
        switch (type) {
          case "regular": {
            if ((_a17 = mode.tools) == null ? void 0 : _a17.length) {
              throw new UnsupportedFunctionalityError({
                functionality: "tools"
              });
            }
            if (mode.toolChoice) {
              throw new UnsupportedFunctionalityError({
                functionality: "toolChoice"
              });
            }
            return { args: baseArgs, warnings };
          }
          case "object-json": {
            throw new UnsupportedFunctionalityError({
              functionality: "object-json mode"
            });
          }
          case "object-tool": {
            throw new UnsupportedFunctionalityError({
              functionality: "object-tool mode"
            });
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      async doGenerate(options) {
        const { args, warnings } = this.getArgs(options);
        const {
          responseHeaders,
          value: response,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: this.config.url({
            path: "/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body: args,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            openaiCompletionResponseSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { prompt: rawPrompt, ...rawSettings } = args;
        const choice = response.choices[0];
        return {
          text: choice.text,
          usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens
          },
          finishReason: mapOpenAIFinishReason(choice.finish_reason),
          logprobs: mapOpenAICompletionLogProbs(choice.logprobs),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders, body: rawResponse },
          response: getResponseMetadata(response),
          warnings,
          request: { body: JSON.stringify(args) }
        };
      }
      async doStream(options) {
        const { args, warnings } = this.getArgs(options);
        const body = {
          ...args,
          stream: true,
          // only include stream_options when in strict compatibility mode:
          stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
        };
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.config.url({
            path: "/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(
            openaiCompletionChunkSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { prompt: rawPrompt, ...rawSettings } = args;
        let finishReason = "unknown";
        let usage = {
          promptTokens: Number.NaN,
          completionTokens: Number.NaN
        };
        let logprobs;
        let isFirstChunk = true;
        return {
          stream: response.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                if (!chunk.success) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                if ("error" in value) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: value.error });
                  return;
                }
                if (isFirstChunk) {
                  isFirstChunk = false;
                  controller.enqueue({
                    type: "response-metadata",
                    ...getResponseMetadata(value)
                  });
                }
                if (value.usage != null) {
                  usage = {
                    promptTokens: value.usage.prompt_tokens,
                    completionTokens: value.usage.completion_tokens
                  };
                }
                const choice = value.choices[0];
                if ((choice == null ? void 0 : choice.finish_reason) != null) {
                  finishReason = mapOpenAIFinishReason(choice.finish_reason);
                }
                if ((choice == null ? void 0 : choice.text) != null) {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: choice.text
                  });
                }
                const mappedLogprobs = mapOpenAICompletionLogProbs(
                  choice == null ? void 0 : choice.logprobs
                );
                if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
                  if (logprobs === void 0) logprobs = [];
                  logprobs.push(...mappedLogprobs);
                }
              },
              flush(controller) {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  logprobs,
                  usage
                });
              }
            })
          ),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders },
          warnings,
          request: { body: JSON.stringify(body) }
        };
      }
    };
    openaiCompletionResponseSchema = external_exports.object({
      id: external_exports.string().nullish(),
      created: external_exports.number().nullish(),
      model: external_exports.string().nullish(),
      choices: external_exports.array(
        external_exports.object({
          text: external_exports.string(),
          finish_reason: external_exports.string(),
          logprobs: external_exports.object({
            tokens: external_exports.array(external_exports.string()),
            token_logprobs: external_exports.array(external_exports.number()),
            top_logprobs: external_exports.array(external_exports.record(external_exports.string(), external_exports.number())).nullable()
          }).nullish()
        })
      ),
      usage: external_exports.object({
        prompt_tokens: external_exports.number(),
        completion_tokens: external_exports.number()
      })
    });
    openaiCompletionChunkSchema = external_exports.union([
      external_exports.object({
        id: external_exports.string().nullish(),
        created: external_exports.number().nullish(),
        model: external_exports.string().nullish(),
        choices: external_exports.array(
          external_exports.object({
            text: external_exports.string(),
            finish_reason: external_exports.string().nullish(),
            index: external_exports.number(),
            logprobs: external_exports.object({
              tokens: external_exports.array(external_exports.string()),
              token_logprobs: external_exports.array(external_exports.number()),
              top_logprobs: external_exports.array(external_exports.record(external_exports.string(), external_exports.number())).nullable()
            }).nullish()
          })
        ),
        usage: external_exports.object({
          prompt_tokens: external_exports.number(),
          completion_tokens: external_exports.number()
        }).nullish()
      }),
      openaiErrorDataSchema
    ]);
    OpenAIEmbeddingModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      get provider() {
        return this.config.provider;
      }
      get maxEmbeddingsPerCall() {
        var _a17;
        return (_a17 = this.settings.maxEmbeddingsPerCall) != null ? _a17 : 2048;
      }
      get supportsParallelCalls() {
        var _a17;
        return (_a17 = this.settings.supportsParallelCalls) != null ? _a17 : true;
      }
      async doEmbed({
        values,
        headers: headers9,
        abortSignal
      }) {
        if (values.length > this.maxEmbeddingsPerCall) {
          throw new TooManyEmbeddingValuesForCallError({
            provider: this.provider,
            modelId: this.modelId,
            maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
            values
          });
        }
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.config.url({
            path: "/embeddings",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), headers9),
          body: {
            model: this.modelId,
            input: values,
            encoding_format: "float",
            dimensions: this.settings.dimensions,
            user: this.settings.user
          },
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            openaiTextEmbeddingResponseSchema
          ),
          abortSignal,
          fetch: this.config.fetch
        });
        return {
          embeddings: response.data.map((item) => item.embedding),
          usage: response.usage ? { tokens: response.usage.prompt_tokens } : void 0,
          rawResponse: { headers: responseHeaders }
        };
      }
    };
    openaiTextEmbeddingResponseSchema = external_exports.object({
      data: external_exports.array(external_exports.object({ embedding: external_exports.array(external_exports.number()) })),
      usage: external_exports.object({ prompt_tokens: external_exports.number() }).nullish()
    });
    modelMaxImagesPerCall = {
      "dall-e-3": 1,
      "dall-e-2": 10,
      "gpt-image-1": 10
    };
    hasDefaultResponseFormat = /* @__PURE__ */ new Set(["gpt-image-1"]);
    OpenAIImageModel = class {
      constructor(modelId, settings, config) {
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
        this.specificationVersion = "v1";
      }
      get maxImagesPerCall() {
        var _a17, _b;
        return (_b = (_a17 = this.settings.maxImagesPerCall) != null ? _a17 : modelMaxImagesPerCall[this.modelId]) != null ? _b : 1;
      }
      get provider() {
        return this.config.provider;
      }
      async doGenerate({
        prompt,
        n,
        size,
        aspectRatio,
        seed,
        providerOptions,
        headers: headers9,
        abortSignal
      }) {
        var _a17, _b, _c, _d;
        const warnings = [];
        if (aspectRatio != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "aspectRatio",
            details: "This model does not support aspect ratio. Use `size` instead."
          });
        }
        if (seed != null) {
          warnings.push({ type: "unsupported-setting", setting: "seed" });
        }
        const currentDate = (_c = (_b = (_a17 = this.config._internal) == null ? void 0 : _a17.currentDate) == null ? void 0 : _b.call(_a17)) != null ? _c : /* @__PURE__ */ new Date();
        const { value: response, responseHeaders } = await postJsonToApi({
          url: this.config.url({
            path: "/images/generations",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), headers9),
          body: {
            model: this.modelId,
            prompt,
            n,
            size,
            ...(_d = providerOptions.openai) != null ? _d : {},
            ...!hasDefaultResponseFormat.has(this.modelId) ? { response_format: "b64_json" } : {}
          },
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            openaiImageResponseSchema
          ),
          abortSignal,
          fetch: this.config.fetch
        });
        return {
          images: response.data.map((item) => item.b64_json),
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders
          }
        };
      }
    };
    openaiImageResponseSchema = external_exports.object({
      data: external_exports.array(external_exports.object({ b64_json: external_exports.string() }))
    });
    openAIProviderOptionsSchema = external_exports.object({
      include: external_exports.array(external_exports.string()).nullish(),
      language: external_exports.string().nullish(),
      prompt: external_exports.string().nullish(),
      temperature: external_exports.number().min(0).max(1).nullish().default(0),
      timestampGranularities: external_exports.array(external_exports.enum(["word", "segment"])).nullish().default(["segment"])
    });
    languageMap = {
      afrikaans: "af",
      arabic: "ar",
      armenian: "hy",
      azerbaijani: "az",
      belarusian: "be",
      bosnian: "bs",
      bulgarian: "bg",
      catalan: "ca",
      chinese: "zh",
      croatian: "hr",
      czech: "cs",
      danish: "da",
      dutch: "nl",
      english: "en",
      estonian: "et",
      finnish: "fi",
      french: "fr",
      galician: "gl",
      german: "de",
      greek: "el",
      hebrew: "he",
      hindi: "hi",
      hungarian: "hu",
      icelandic: "is",
      indonesian: "id",
      italian: "it",
      japanese: "ja",
      kannada: "kn",
      kazakh: "kk",
      korean: "ko",
      latvian: "lv",
      lithuanian: "lt",
      macedonian: "mk",
      malay: "ms",
      marathi: "mr",
      maori: "mi",
      nepali: "ne",
      norwegian: "no",
      persian: "fa",
      polish: "pl",
      portuguese: "pt",
      romanian: "ro",
      russian: "ru",
      serbian: "sr",
      slovak: "sk",
      slovenian: "sl",
      spanish: "es",
      swahili: "sw",
      swedish: "sv",
      tagalog: "tl",
      tamil: "ta",
      thai: "th",
      turkish: "tr",
      ukrainian: "uk",
      urdu: "ur",
      vietnamese: "vi",
      welsh: "cy"
    };
    OpenAITranscriptionModel = class {
      constructor(modelId, config) {
        this.modelId = modelId;
        this.config = config;
        this.specificationVersion = "v1";
      }
      get provider() {
        return this.config.provider;
      }
      getArgs({
        audio,
        mediaType,
        providerOptions
      }) {
        var _a17, _b, _c, _d, _e;
        const warnings = [];
        const openAIOptions = parseProviderOptions({
          provider: "openai",
          providerOptions,
          schema: openAIProviderOptionsSchema
        });
        const formData = new FormData();
        const blob = audio instanceof Uint8Array ? new Blob([audio]) : new Blob([convertBase64ToUint8Array(audio)]);
        formData.append("model", this.modelId);
        formData.append("file", new File([blob], "audio", { type: mediaType }));
        if (openAIOptions) {
          const transcriptionModelOptions = {
            include: (_a17 = openAIOptions.include) != null ? _a17 : void 0,
            language: (_b = openAIOptions.language) != null ? _b : void 0,
            prompt: (_c = openAIOptions.prompt) != null ? _c : void 0,
            temperature: (_d = openAIOptions.temperature) != null ? _d : void 0,
            timestamp_granularities: (_e = openAIOptions.timestampGranularities) != null ? _e : void 0
          };
          for (const key in transcriptionModelOptions) {
            const value = transcriptionModelOptions[key];
            if (value !== void 0) {
              formData.append(key, String(value));
            }
          }
        }
        return {
          formData,
          warnings
        };
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d, _e, _f;
        const currentDate = (_c = (_b = (_a17 = this.config._internal) == null ? void 0 : _a17.currentDate) == null ? void 0 : _b.call(_a17)) != null ? _c : /* @__PURE__ */ new Date();
        const { formData, warnings } = this.getArgs(options);
        const {
          value: response,
          responseHeaders,
          rawValue: rawResponse
        } = await postFormDataToApi({
          url: this.config.url({
            path: "/audio/transcriptions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          formData,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            openaiTranscriptionResponseSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const language = response.language != null && response.language in languageMap ? languageMap[response.language] : void 0;
        return {
          text: response.text,
          segments: (_e = (_d = response.words) == null ? void 0 : _d.map((word) => ({
            text: word.word,
            startSecond: word.start,
            endSecond: word.end
          }))) != null ? _e : [],
          language,
          durationInSeconds: (_f = response.duration) != null ? _f : void 0,
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders,
            body: rawResponse
          }
        };
      }
    };
    openaiTranscriptionResponseSchema = external_exports.object({
      text: external_exports.string(),
      language: external_exports.string().nullish(),
      duration: external_exports.number().nullish(),
      words: external_exports.array(
        external_exports.object({
          word: external_exports.string(),
          start: external_exports.number(),
          end: external_exports.number()
        })
      ).nullish()
    });
    OpenAIResponsesLanguageModel = class {
      constructor(modelId, config) {
        this.specificationVersion = "v1";
        this.defaultObjectGenerationMode = "json";
        this.supportsStructuredOutputs = true;
        this.modelId = modelId;
        this.config = config;
      }
      get provider() {
        return this.config.provider;
      }
      getArgs({
        mode,
        maxTokens,
        temperature,
        stopSequences,
        topP,
        topK,
        presencePenalty,
        frequencyPenalty,
        seed,
        prompt,
        providerMetadata,
        responseFormat
      }) {
        var _a17, _b, _c;
        const warnings = [];
        const modelConfig = getResponsesModelConfig(this.modelId);
        const type = mode.type;
        if (topK != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "topK"
          });
        }
        if (seed != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "seed"
          });
        }
        if (presencePenalty != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "presencePenalty"
          });
        }
        if (frequencyPenalty != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "frequencyPenalty"
          });
        }
        if (stopSequences != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "stopSequences"
          });
        }
        const { messages, warnings: messageWarnings } = convertToOpenAIResponsesMessages({
          prompt,
          systemMessageMode: modelConfig.systemMessageMode
        });
        warnings.push(...messageWarnings);
        const openaiOptions = parseProviderOptions({
          provider: "openai",
          providerOptions: providerMetadata,
          schema: openaiResponsesProviderOptionsSchema
        });
        const isStrict = (_a17 = openaiOptions == null ? void 0 : openaiOptions.strictSchemas) != null ? _a17 : true;
        const baseArgs = {
          model: this.modelId,
          input: messages,
          temperature,
          top_p: topP,
          max_output_tokens: maxTokens,
          ...(responseFormat == null ? void 0 : responseFormat.type) === "json" && {
            text: {
              format: responseFormat.schema != null ? {
                type: "json_schema",
                strict: isStrict,
                name: (_b = responseFormat.name) != null ? _b : "response",
                description: responseFormat.description,
                schema: responseFormat.schema
              } : { type: "json_object" }
            }
          },
          // provider options:
          metadata: openaiOptions == null ? void 0 : openaiOptions.metadata,
          parallel_tool_calls: openaiOptions == null ? void 0 : openaiOptions.parallelToolCalls,
          previous_response_id: openaiOptions == null ? void 0 : openaiOptions.previousResponseId,
          store: openaiOptions == null ? void 0 : openaiOptions.store,
          user: openaiOptions == null ? void 0 : openaiOptions.user,
          instructions: openaiOptions == null ? void 0 : openaiOptions.instructions,
          // model-specific settings:
          ...modelConfig.isReasoningModel && ((openaiOptions == null ? void 0 : openaiOptions.reasoningEffort) != null || (openaiOptions == null ? void 0 : openaiOptions.reasoningSummary) != null) && {
            reasoning: {
              ...(openaiOptions == null ? void 0 : openaiOptions.reasoningEffort) != null && {
                effort: openaiOptions.reasoningEffort
              },
              ...(openaiOptions == null ? void 0 : openaiOptions.reasoningSummary) != null && {
                summary: openaiOptions.reasoningSummary
              }
            }
          },
          ...modelConfig.requiredAutoTruncation && {
            truncation: "auto"
          }
        };
        if (modelConfig.isReasoningModel) {
          if (baseArgs.temperature != null) {
            baseArgs.temperature = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "temperature",
              details: "temperature is not supported for reasoning models"
            });
          }
          if (baseArgs.top_p != null) {
            baseArgs.top_p = void 0;
            warnings.push({
              type: "unsupported-setting",
              setting: "topP",
              details: "topP is not supported for reasoning models"
            });
          }
        }
        switch (type) {
          case "regular": {
            const { tools, tool_choice, toolWarnings } = prepareResponsesTools({
              mode,
              strict: isStrict
              // TODO support provider options on tools
            });
            return {
              args: {
                ...baseArgs,
                tools,
                tool_choice
              },
              warnings: [...warnings, ...toolWarnings]
            };
          }
          case "object-json": {
            return {
              args: {
                ...baseArgs,
                text: {
                  format: mode.schema != null ? {
                    type: "json_schema",
                    strict: isStrict,
                    name: (_c = mode.name) != null ? _c : "response",
                    description: mode.description,
                    schema: mode.schema
                  } : { type: "json_object" }
                }
              },
              warnings
            };
          }
          case "object-tool": {
            return {
              args: {
                ...baseArgs,
                tool_choice: { type: "function", name: mode.tool.name },
                tools: [
                  {
                    type: "function",
                    name: mode.tool.name,
                    description: mode.tool.description,
                    parameters: mode.tool.parameters,
                    strict: isStrict
                  }
                ]
              },
              warnings
            };
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d, _e, _f, _g;
        const { args: body, warnings } = this.getArgs(options);
        const url = this.config.url({
          path: "/responses",
          modelId: this.modelId
        });
        const {
          responseHeaders,
          value: response,
          rawValue: rawResponse
        } = await postJsonToApi({
          url,
          headers: combineHeaders(this.config.headers(), options.headers),
          body,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            external_exports.object({
              id: external_exports.string(),
              created_at: external_exports.number(),
              error: external_exports.object({
                message: external_exports.string(),
                code: external_exports.string()
              }).nullish(),
              model: external_exports.string(),
              output: external_exports.array(
                external_exports.discriminatedUnion("type", [
                  external_exports.object({
                    type: external_exports.literal("message"),
                    role: external_exports.literal("assistant"),
                    content: external_exports.array(
                      external_exports.object({
                        type: external_exports.literal("output_text"),
                        text: external_exports.string(),
                        annotations: external_exports.array(
                          external_exports.object({
                            type: external_exports.literal("url_citation"),
                            start_index: external_exports.number(),
                            end_index: external_exports.number(),
                            url: external_exports.string(),
                            title: external_exports.string()
                          })
                        )
                      })
                    )
                  }),
                  external_exports.object({
                    type: external_exports.literal("function_call"),
                    call_id: external_exports.string(),
                    name: external_exports.string(),
                    arguments: external_exports.string()
                  }),
                  external_exports.object({
                    type: external_exports.literal("web_search_call")
                  }),
                  external_exports.object({
                    type: external_exports.literal("computer_call")
                  }),
                  external_exports.object({
                    type: external_exports.literal("reasoning"),
                    summary: external_exports.array(
                      external_exports.object({
                        type: external_exports.literal("summary_text"),
                        text: external_exports.string()
                      })
                    )
                  })
                ])
              ),
              incomplete_details: external_exports.object({ reason: external_exports.string() }).nullable(),
              usage: usageSchema
            })
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        if (response.error) {
          throw new APICallError({
            message: response.error.message,
            url,
            requestBodyValues: body,
            statusCode: 400,
            responseHeaders,
            responseBody: rawResponse,
            isRetryable: false
          });
        }
        const outputTextElements = response.output.filter((output) => output.type === "message").flatMap((output) => output.content).filter((content) => content.type === "output_text");
        const toolCalls = response.output.filter((output) => output.type === "function_call").map((output) => ({
          toolCallType: "function",
          toolCallId: output.call_id,
          toolName: output.name,
          args: output.arguments
        }));
        const reasoningSummary = (_b = (_a17 = response.output.find((item) => item.type === "reasoning")) == null ? void 0 : _a17.summary) != null ? _b : null;
        return {
          text: outputTextElements.map((content) => content.text).join("\n"),
          sources: outputTextElements.flatMap(
            (content) => content.annotations.map((annotation) => {
              var _a23, _b2, _c2;
              return {
                sourceType: "url",
                id: (_c2 = (_b2 = (_a23 = this.config).generateId) == null ? void 0 : _b2.call(_a23)) != null ? _c2 : generateId(),
                url: annotation.url,
                title: annotation.title
              };
            })
          ),
          finishReason: mapOpenAIResponseFinishReason({
            finishReason: (_c = response.incomplete_details) == null ? void 0 : _c.reason,
            hasToolCalls: toolCalls.length > 0
          }),
          toolCalls: toolCalls.length > 0 ? toolCalls : void 0,
          reasoning: reasoningSummary ? reasoningSummary.map((summary) => ({
            type: "text",
            text: summary.text
          })) : void 0,
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens
          },
          rawCall: {
            rawPrompt: void 0,
            rawSettings: {}
          },
          rawResponse: {
            headers: responseHeaders,
            body: rawResponse
          },
          request: {
            body: JSON.stringify(body)
          },
          response: {
            id: response.id,
            timestamp: new Date(response.created_at * 1e3),
            modelId: response.model
          },
          providerMetadata: {
            openai: {
              responseId: response.id,
              cachedPromptTokens: (_e = (_d = response.usage.input_tokens_details) == null ? void 0 : _d.cached_tokens) != null ? _e : null,
              reasoningTokens: (_g = (_f = response.usage.output_tokens_details) == null ? void 0 : _f.reasoning_tokens) != null ? _g : null
            }
          },
          warnings
        };
      }
      async doStream(options) {
        const { args: body, warnings } = this.getArgs(options);
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.config.url({
            path: "/responses",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body: {
            ...body,
            stream: true
          },
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(
            openaiResponsesChunkSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const self = this;
        let finishReason = "unknown";
        let promptTokens = NaN;
        let completionTokens = NaN;
        let cachedPromptTokens = null;
        let reasoningTokens = null;
        let responseId = null;
        const ongoingToolCalls = {};
        let hasToolCalls = false;
        return {
          stream: response.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                var _a17, _b, _c, _d, _e, _f, _g, _h;
                if (!chunk.success) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                if (isResponseOutputItemAddedChunk(value)) {
                  if (value.item.type === "function_call") {
                    ongoingToolCalls[value.output_index] = {
                      toolName: value.item.name,
                      toolCallId: value.item.call_id
                    };
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: value.item.call_id,
                      toolName: value.item.name,
                      argsTextDelta: value.item.arguments
                    });
                  }
                } else if (isResponseFunctionCallArgumentsDeltaChunk(value)) {
                  const toolCall = ongoingToolCalls[value.output_index];
                  if (toolCall != null) {
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: toolCall.toolCallId,
                      toolName: toolCall.toolName,
                      argsTextDelta: value.delta
                    });
                  }
                } else if (isResponseCreatedChunk(value)) {
                  responseId = value.response.id;
                  controller.enqueue({
                    type: "response-metadata",
                    id: value.response.id,
                    timestamp: new Date(value.response.created_at * 1e3),
                    modelId: value.response.model
                  });
                } else if (isTextDeltaChunk(value)) {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: value.delta
                  });
                } else if (isResponseReasoningSummaryTextDeltaChunk(value)) {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: value.delta
                  });
                } else if (isResponseOutputItemDoneChunk(value) && value.item.type === "function_call") {
                  ongoingToolCalls[value.output_index] = void 0;
                  hasToolCalls = true;
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: value.item.call_id,
                    toolName: value.item.name,
                    args: value.item.arguments
                  });
                } else if (isResponseFinishedChunk(value)) {
                  finishReason = mapOpenAIResponseFinishReason({
                    finishReason: (_a17 = value.response.incomplete_details) == null ? void 0 : _a17.reason,
                    hasToolCalls
                  });
                  promptTokens = value.response.usage.input_tokens;
                  completionTokens = value.response.usage.output_tokens;
                  cachedPromptTokens = (_c = (_b = value.response.usage.input_tokens_details) == null ? void 0 : _b.cached_tokens) != null ? _c : cachedPromptTokens;
                  reasoningTokens = (_e = (_d = value.response.usage.output_tokens_details) == null ? void 0 : _d.reasoning_tokens) != null ? _e : reasoningTokens;
                } else if (isResponseAnnotationAddedChunk(value)) {
                  controller.enqueue({
                    type: "source",
                    source: {
                      sourceType: "url",
                      id: (_h = (_g = (_f = self.config).generateId) == null ? void 0 : _g.call(_f)) != null ? _h : generateId(),
                      url: value.annotation.url,
                      title: value.annotation.title
                    }
                  });
                } else if (isErrorChunk(value)) {
                  controller.enqueue({ type: "error", error: value });
                }
              },
              flush(controller) {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage: { promptTokens, completionTokens },
                  ...(cachedPromptTokens != null || reasoningTokens != null) && {
                    providerMetadata: {
                      openai: {
                        responseId,
                        cachedPromptTokens,
                        reasoningTokens
                      }
                    }
                  }
                });
              }
            })
          ),
          rawCall: {
            rawPrompt: void 0,
            rawSettings: {}
          },
          rawResponse: { headers: responseHeaders },
          request: { body: JSON.stringify(body) },
          warnings
        };
      }
    };
    usageSchema = external_exports.object({
      input_tokens: external_exports.number(),
      input_tokens_details: external_exports.object({ cached_tokens: external_exports.number().nullish() }).nullish(),
      output_tokens: external_exports.number(),
      output_tokens_details: external_exports.object({ reasoning_tokens: external_exports.number().nullish() }).nullish()
    });
    textDeltaChunkSchema = external_exports.object({
      type: external_exports.literal("response.output_text.delta"),
      delta: external_exports.string()
    });
    responseFinishedChunkSchema = external_exports.object({
      type: external_exports.enum(["response.completed", "response.incomplete"]),
      response: external_exports.object({
        incomplete_details: external_exports.object({ reason: external_exports.string() }).nullish(),
        usage: usageSchema
      })
    });
    responseCreatedChunkSchema = external_exports.object({
      type: external_exports.literal("response.created"),
      response: external_exports.object({
        id: external_exports.string(),
        created_at: external_exports.number(),
        model: external_exports.string()
      })
    });
    responseOutputItemDoneSchema = external_exports.object({
      type: external_exports.literal("response.output_item.done"),
      output_index: external_exports.number(),
      item: external_exports.discriminatedUnion("type", [
        external_exports.object({
          type: external_exports.literal("message")
        }),
        external_exports.object({
          type: external_exports.literal("function_call"),
          id: external_exports.string(),
          call_id: external_exports.string(),
          name: external_exports.string(),
          arguments: external_exports.string(),
          status: external_exports.literal("completed")
        })
      ])
    });
    responseFunctionCallArgumentsDeltaSchema = external_exports.object({
      type: external_exports.literal("response.function_call_arguments.delta"),
      item_id: external_exports.string(),
      output_index: external_exports.number(),
      delta: external_exports.string()
    });
    responseOutputItemAddedSchema = external_exports.object({
      type: external_exports.literal("response.output_item.added"),
      output_index: external_exports.number(),
      item: external_exports.discriminatedUnion("type", [
        external_exports.object({
          type: external_exports.literal("message")
        }),
        external_exports.object({
          type: external_exports.literal("function_call"),
          id: external_exports.string(),
          call_id: external_exports.string(),
          name: external_exports.string(),
          arguments: external_exports.string()
        })
      ])
    });
    responseAnnotationAddedSchema = external_exports.object({
      type: external_exports.literal("response.output_text.annotation.added"),
      annotation: external_exports.object({
        type: external_exports.literal("url_citation"),
        url: external_exports.string(),
        title: external_exports.string()
      })
    });
    responseReasoningSummaryTextDeltaSchema = external_exports.object({
      type: external_exports.literal("response.reasoning_summary_text.delta"),
      item_id: external_exports.string(),
      output_index: external_exports.number(),
      summary_index: external_exports.number(),
      delta: external_exports.string()
    });
    errorChunkSchema = external_exports.object({
      type: external_exports.literal("error"),
      code: external_exports.string(),
      message: external_exports.string(),
      param: external_exports.string().nullish(),
      sequence_number: external_exports.number()
    });
    openaiResponsesChunkSchema = external_exports.union([
      textDeltaChunkSchema,
      responseFinishedChunkSchema,
      responseCreatedChunkSchema,
      responseOutputItemDoneSchema,
      responseFunctionCallArgumentsDeltaSchema,
      responseOutputItemAddedSchema,
      responseAnnotationAddedSchema,
      responseReasoningSummaryTextDeltaSchema,
      errorChunkSchema,
      external_exports.object({ type: external_exports.string() }).passthrough()
      // fallback for unknown chunks
    ]);
    openaiResponsesProviderOptionsSchema = external_exports.object({
      metadata: external_exports.any().nullish(),
      parallelToolCalls: external_exports.boolean().nullish(),
      previousResponseId: external_exports.string().nullish(),
      store: external_exports.boolean().nullish(),
      user: external_exports.string().nullish(),
      reasoningEffort: external_exports.string().nullish(),
      strictSchemas: external_exports.boolean().nullish(),
      instructions: external_exports.string().nullish(),
      reasoningSummary: external_exports.string().nullish()
    });
    WebSearchPreviewParameters = external_exports.object({});
    openaiTools = {
      webSearchPreview: webSearchPreviewTool
    };
    OpenAIProviderOptionsSchema = external_exports.object({
      instructions: external_exports.string().nullish(),
      speed: external_exports.number().min(0.25).max(4).default(1).nullish()
    });
    OpenAISpeechModel = class {
      constructor(modelId, config) {
        this.modelId = modelId;
        this.config = config;
        this.specificationVersion = "v1";
      }
      get provider() {
        return this.config.provider;
      }
      getArgs({
        text: text2,
        voice = "alloy",
        outputFormat = "mp3",
        speed,
        instructions,
        providerOptions
      }) {
        const warnings = [];
        const openAIOptions = parseProviderOptions({
          provider: "openai",
          providerOptions,
          schema: OpenAIProviderOptionsSchema
        });
        const requestBody = {
          model: this.modelId,
          input: text2,
          voice,
          response_format: "mp3",
          speed,
          instructions
        };
        if (outputFormat) {
          if (["mp3", "opus", "aac", "flac", "wav", "pcm"].includes(outputFormat)) {
            requestBody.response_format = outputFormat;
          } else {
            warnings.push({
              type: "unsupported-setting",
              setting: "outputFormat",
              details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`
            });
          }
        }
        if (openAIOptions) {
          const speechModelOptions = {};
          for (const key in speechModelOptions) {
            const value = speechModelOptions[key];
            if (value !== void 0) {
              requestBody[key] = value;
            }
          }
        }
        return {
          requestBody,
          warnings
        };
      }
      async doGenerate(options) {
        var _a17, _b, _c;
        const currentDate = (_c = (_b = (_a17 = this.config._internal) == null ? void 0 : _a17.currentDate) == null ? void 0 : _b.call(_a17)) != null ? _c : /* @__PURE__ */ new Date();
        const { requestBody, warnings } = this.getArgs(options);
        const {
          value: audio,
          responseHeaders,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: this.config.url({
            path: "/audio/speech",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body: requestBody,
          failedResponseHandler: openaiFailedResponseHandler,
          successfulResponseHandler: createBinaryResponseHandler(),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        return {
          audio,
          warnings,
          request: {
            body: JSON.stringify(requestBody)
          },
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders,
            body: rawResponse
          }
        };
      }
    };
    openai = createOpenAI({
      compatibility: "strict"
      // strict for OpenAI API
    });
  }
});

// node_modules/@ai-sdk/google/dist/index.mjs
var dist_exports3 = {};
__export(dist_exports3, {
  createGoogleGenerativeAI: () => createGoogleGenerativeAI,
  google: () => google
});
function convertJSONSchemaToOpenAPISchema(jsonSchema2) {
  if (isEmptyObjectSchema(jsonSchema2)) {
    return void 0;
  }
  if (typeof jsonSchema2 === "boolean") {
    return { type: "boolean", properties: {} };
  }
  const {
    type,
    description,
    required,
    properties,
    items,
    allOf,
    anyOf,
    oneOf,
    format,
    const: constValue,
    minLength,
    enum: enumValues
  } = jsonSchema2;
  const result = {};
  if (description)
    result.description = description;
  if (required)
    result.required = required;
  if (format)
    result.format = format;
  if (constValue !== void 0) {
    result.enum = [constValue];
  }
  if (type) {
    if (Array.isArray(type)) {
      if (type.includes("null")) {
        result.type = type.filter((t) => t !== "null")[0];
        result.nullable = true;
      } else {
        result.type = type;
      }
    } else if (type === "null") {
      result.type = "null";
    } else {
      result.type = type;
    }
  }
  if (enumValues !== void 0) {
    result.enum = enumValues;
  }
  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value);
        return acc;
      },
      {}
    );
  }
  if (items) {
    result.items = Array.isArray(items) ? items.map(convertJSONSchemaToOpenAPISchema) : convertJSONSchemaToOpenAPISchema(items);
  }
  if (allOf) {
    result.allOf = allOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (anyOf) {
    if (anyOf.some(
      (schema) => typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null"
    )) {
      const nonNullSchemas = anyOf.filter(
        (schema) => !(typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null")
      );
      if (nonNullSchemas.length === 1) {
        const converted = convertJSONSchemaToOpenAPISchema(nonNullSchemas[0]);
        if (typeof converted === "object") {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        result.anyOf = nonNullSchemas.map(convertJSONSchemaToOpenAPISchema);
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(convertJSONSchemaToOpenAPISchema);
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (minLength !== void 0) {
    result.minLength = minLength;
  }
  return result;
}
function isEmptyObjectSchema(jsonSchema2) {
  return jsonSchema2 != null && typeof jsonSchema2 === "object" && jsonSchema2.type === "object" && (jsonSchema2.properties == null || Object.keys(jsonSchema2.properties).length === 0) && !jsonSchema2.additionalProperties;
}
function convertToGoogleGenerativeAIMessages(prompt) {
  var _a17, _b;
  const systemInstructionParts = [];
  const contents = [];
  let systemMessagesAllowed = true;
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality: "system messages are only supported at the beginning of the conversation"
          });
        }
        systemInstructionParts.push({ text: content });
        break;
      }
      case "user": {
        systemMessagesAllowed = false;
        const parts = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              parts.push({ text: part.text });
              break;
            }
            case "image": {
              parts.push(
                part.image instanceof URL ? {
                  fileData: {
                    mimeType: (_a17 = part.mimeType) != null ? _a17 : "image/jpeg",
                    fileUri: part.image.toString()
                  }
                } : {
                  inlineData: {
                    mimeType: (_b = part.mimeType) != null ? _b : "image/jpeg",
                    data: convertUint8ArrayToBase64(part.image)
                  }
                }
              );
              break;
            }
            case "file": {
              parts.push(
                part.data instanceof URL ? {
                  fileData: {
                    mimeType: part.mimeType,
                    fileUri: part.data.toString()
                  }
                } : {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data
                  }
                }
              );
              break;
            }
          }
        }
        contents.push({ role: "user", parts });
        break;
      }
      case "assistant": {
        systemMessagesAllowed = false;
        contents.push({
          role: "model",
          parts: content.map((part) => {
            switch (part.type) {
              case "text": {
                return part.text.length === 0 ? void 0 : { text: part.text };
              }
              case "file": {
                if (part.mimeType !== "image/png") {
                  throw new UnsupportedFunctionalityError({
                    functionality: "Only PNG images are supported in assistant messages"
                  });
                }
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "File data URLs in assistant messages are not supported"
                  });
                }
                return {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data
                  }
                };
              }
              case "tool-call": {
                return {
                  functionCall: {
                    name: part.toolName,
                    args: part.args
                  }
                };
              }
            }
          }).filter((part) => part !== void 0)
        });
        break;
      }
      case "tool": {
        systemMessagesAllowed = false;
        contents.push({
          role: "user",
          parts: content.map((part) => ({
            functionResponse: {
              name: part.toolName,
              response: {
                name: part.toolName,
                content: part.result
              }
            }
          }))
        });
        break;
      }
    }
  }
  return {
    systemInstruction: systemInstructionParts.length > 0 ? { parts: systemInstructionParts } : void 0,
    contents
  };
}
function getModelPath(modelId) {
  return modelId.includes("/") ? modelId : `models/${modelId}`;
}
function prepareTools3(mode, useSearchGrounding, dynamicRetrievalConfig, modelId) {
  var _a17, _b;
  const tools = ((_a17 = mode.tools) == null ? void 0 : _a17.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const isGemini2 = modelId.includes("gemini-2");
  const supportsDynamicRetrieval = modelId.includes("gemini-1.5-flash") && !modelId.includes("-8b");
  if (useSearchGrounding) {
    return {
      tools: isGemini2 ? { googleSearch: {} } : {
        googleSearchRetrieval: !supportsDynamicRetrieval || !dynamicRetrievalConfig ? {} : { dynamicRetrievalConfig }
      },
      toolConfig: void 0,
      toolWarnings
    };
  }
  if (tools == null) {
    return { tools: void 0, toolConfig: void 0, toolWarnings };
  }
  const functionDeclarations = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      functionDeclarations.push({
        name: tool.name,
        description: (_b = tool.description) != null ? _b : "",
        parameters: convertJSONSchemaToOpenAPISchema(tool.parameters)
      });
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      tools: { functionDeclarations },
      toolConfig: void 0,
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        toolWarnings
      };
    case "none":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "NONE" } },
        toolWarnings
      };
    case "required":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        toolWarnings
      };
    case "tool":
      return {
        tools: { functionDeclarations },
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [toolChoice.toolName]
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case "STOP":
      return hasToolCalls ? "tool-calls" : "stop";
    case "MAX_TOKENS":
      return "length";
    case "IMAGE_SAFETY":
    case "RECITATION":
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content-filter";
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
      return "other";
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "unknown";
  }
}
function getToolCallsFromParts({
  parts,
  generateId: generateId2
}) {
  const functionCallParts = parts == null ? void 0 : parts.filter(
    (part) => "functionCall" in part
  );
  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    toolCallType: "function",
    toolCallId: generateId2(),
    toolName: part.functionCall.name,
    args: JSON.stringify(part.functionCall.args)
  }));
}
function getTextFromParts(parts) {
  const textParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought !== true
  );
  return textParts == null || textParts.length === 0 ? void 0 : textParts.map((part) => part.text).join("");
}
function getReasoningDetailsFromParts(parts) {
  const reasoningParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought === true && part.text != null
  );
  return reasoningParts == null || reasoningParts.length === 0 ? void 0 : reasoningParts.map((part) => ({ type: "text", text: part.text }));
}
function getInlineDataParts(parts) {
  return parts == null ? void 0 : parts.filter(
    (part) => "inlineData" in part
  );
}
function extractSources({
  groundingMetadata,
  generateId: generateId2
}) {
  var _a17;
  return (_a17 = groundingMetadata == null ? void 0 : groundingMetadata.groundingChunks) == null ? void 0 : _a17.filter(
    (chunk) => chunk.web != null
  ).map((chunk) => ({
    sourceType: "url",
    id: generateId2(),
    url: chunk.web.uri,
    title: chunk.web.title
  }));
}
function isSupportedFileUrl(url) {
  return url.toString().startsWith("https://generativelanguage.googleapis.com/v1beta/files/");
}
function createGoogleGenerativeAI(options = {}) {
  var _a17;
  const baseURL = (_a17 = withoutTrailingSlash(options.baseURL)) != null ? _a17 : "https://generativelanguage.googleapis.com/v1beta";
  const getHeaders = () => ({
    "x-goog-api-key": loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "GOOGLE_GENERATIVE_AI_API_KEY",
      description: "Google Generative AI"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => {
    var _a23;
    return new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: "google.generative-ai",
      baseURL,
      headers: getHeaders,
      generateId: (_a23 = options.generateId) != null ? _a23 : generateId,
      isSupportedUrl: isSupportedFileUrl,
      fetch: options.fetch
    });
  };
  const createEmbeddingModel = (modelId, settings = {}) => new GoogleGenerativeAIEmbeddingModel(modelId, settings, {
    provider: "google.generative-ai",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Google Generative AI model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  return provider;
}
var googleErrorDataSchema, googleFailedResponseHandler, GoogleGenerativeAILanguageModel, contentSchema, groundingChunkSchema, groundingMetadataSchema, safetyRatingSchema, responseSchema, chunkSchema, googleGenerativeAIProviderOptionsSchema, GoogleGenerativeAIEmbeddingModel, googleGenerativeAITextEmbeddingResponseSchema, google;
var init_dist5 = __esm({
  "node_modules/@ai-sdk/google/dist/index.mjs"() {
    init_dist2();
    init_dist2();
    init_zod();
    init_dist();
    init_dist2();
    init_dist2();
    init_zod();
    init_dist();
    init_dist();
    init_dist2();
    init_zod();
    googleErrorDataSchema = external_exports.object({
      error: external_exports.object({
        code: external_exports.number().nullable(),
        message: external_exports.string(),
        status: external_exports.string()
      })
    });
    googleFailedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: googleErrorDataSchema,
      errorToMessage: (data) => data.error.message
    });
    GoogleGenerativeAILanguageModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.defaultObjectGenerationMode = "json";
        this.supportsImageUrls = false;
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      get supportsStructuredOutputs() {
        var _a17;
        return (_a17 = this.settings.structuredOutputs) != null ? _a17 : true;
      }
      get provider() {
        return this.config.provider;
      }
      async getArgs({
        mode,
        prompt,
        maxTokens,
        temperature,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        stopSequences,
        responseFormat,
        seed,
        providerMetadata
      }) {
        var _a17, _b, _c;
        const type = mode.type;
        const warnings = [];
        const googleOptions = parseProviderOptions({
          provider: "google",
          providerOptions: providerMetadata,
          schema: googleGenerativeAIProviderOptionsSchema
        });
        if (((_a17 = googleOptions == null ? void 0 : googleOptions.thinkingConfig) == null ? void 0 : _a17.includeThoughts) === true && !this.config.provider.startsWith("google.vertex.")) {
          warnings.push({
            type: "other",
            message: `The 'includeThoughts' option is only supported with the Google Vertex provider and might not be supported or could behave unexpectedly with the current Google provider (${this.config.provider}).`
          });
        }
        const generationConfig = {
          // standardized settings:
          maxOutputTokens: maxTokens,
          temperature,
          topK,
          topP,
          frequencyPenalty,
          presencePenalty,
          stopSequences,
          seed,
          // response format:
          responseMimeType: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? "application/json" : void 0,
          responseSchema: (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && // Google GenAI does not support all OpenAPI Schema features,
          // so this is needed as an escape hatch:
          this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(responseFormat.schema) : void 0,
          ...this.settings.audioTimestamp && {
            audioTimestamp: this.settings.audioTimestamp
          },
          // provider options:
          responseModalities: googleOptions == null ? void 0 : googleOptions.responseModalities,
          thinkingConfig: googleOptions == null ? void 0 : googleOptions.thinkingConfig
        };
        const { contents, systemInstruction } = convertToGoogleGenerativeAIMessages(prompt);
        switch (type) {
          case "regular": {
            const { tools, toolConfig, toolWarnings } = prepareTools3(
              mode,
              (_b = this.settings.useSearchGrounding) != null ? _b : false,
              this.settings.dynamicRetrievalConfig,
              this.modelId
            );
            return {
              args: {
                generationConfig,
                contents,
                systemInstruction,
                safetySettings: this.settings.safetySettings,
                tools,
                toolConfig,
                cachedContent: this.settings.cachedContent
              },
              warnings: [...warnings, ...toolWarnings]
            };
          }
          case "object-json": {
            return {
              args: {
                generationConfig: {
                  ...generationConfig,
                  responseMimeType: "application/json",
                  responseSchema: mode.schema != null && // Google GenAI does not support all OpenAPI Schema features,
                  // so this is needed as an escape hatch:
                  this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(mode.schema) : void 0
                },
                contents,
                systemInstruction,
                safetySettings: this.settings.safetySettings,
                cachedContent: this.settings.cachedContent
              },
              warnings
            };
          }
          case "object-tool": {
            return {
              args: {
                generationConfig,
                contents,
                systemInstruction,
                tools: {
                  functionDeclarations: [
                    {
                      name: mode.tool.name,
                      description: (_c = mode.tool.description) != null ? _c : "",
                      parameters: convertJSONSchemaToOpenAPISchema(
                        mode.tool.parameters
                      )
                    }
                  ]
                },
                toolConfig: { functionCallingConfig: { mode: "ANY" } },
                safetySettings: this.settings.safetySettings,
                cachedContent: this.settings.cachedContent
              },
              warnings
            };
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      supportsUrl(url) {
        return this.config.isSupportedUrl(url);
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d, _e;
        const { args, warnings } = await this.getArgs(options);
        const body = JSON.stringify(args);
        const mergedHeaders = combineHeaders(
          await resolve(this.config.headers),
          options.headers
        );
        const {
          responseHeaders,
          value: response,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: `${this.config.baseURL}/${getModelPath(
            this.modelId
          )}:generateContent`,
          headers: mergedHeaders,
          body: args,
          failedResponseHandler: googleFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(responseSchema),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { contents: rawPrompt, ...rawSettings } = args;
        const candidate = response.candidates[0];
        const parts = candidate.content == null || typeof candidate.content !== "object" || !("parts" in candidate.content) ? [] : candidate.content.parts;
        const toolCalls = getToolCallsFromParts({
          parts,
          // Use candidateParts
          generateId: this.config.generateId
        });
        const usageMetadata = response.usageMetadata;
        return {
          text: getTextFromParts(parts),
          reasoning: getReasoningDetailsFromParts(parts),
          files: (_a17 = getInlineDataParts(parts)) == null ? void 0 : _a17.map((part) => ({
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType
          })),
          toolCalls,
          finishReason: mapGoogleGenerativeAIFinishReason({
            finishReason: candidate.finishReason,
            hasToolCalls: toolCalls != null && toolCalls.length > 0
          }),
          usage: {
            promptTokens: (_b = usageMetadata == null ? void 0 : usageMetadata.promptTokenCount) != null ? _b : NaN,
            completionTokens: (_c = usageMetadata == null ? void 0 : usageMetadata.candidatesTokenCount) != null ? _c : NaN
          },
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders, body: rawResponse },
          warnings,
          providerMetadata: {
            google: {
              groundingMetadata: (_d = candidate.groundingMetadata) != null ? _d : null,
              safetyRatings: (_e = candidate.safetyRatings) != null ? _e : null
            }
          },
          sources: extractSources({
            groundingMetadata: candidate.groundingMetadata,
            generateId: this.config.generateId
          }),
          request: { body }
        };
      }
      async doStream(options) {
        const { args, warnings } = await this.getArgs(options);
        const body = JSON.stringify(args);
        const headers9 = combineHeaders(
          await resolve(this.config.headers),
          options.headers
        );
        const { responseHeaders, value: response } = await postJsonToApi({
          url: `${this.config.baseURL}/${getModelPath(
            this.modelId
          )}:streamGenerateContent?alt=sse`,
          headers: headers9,
          body: args,
          failedResponseHandler: googleFailedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { contents: rawPrompt, ...rawSettings } = args;
        let finishReason = "unknown";
        let usage = {
          promptTokens: Number.NaN,
          completionTokens: Number.NaN
        };
        let providerMetadata = void 0;
        const generateId2 = this.config.generateId;
        let hasToolCalls = false;
        return {
          stream: response.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                var _a17, _b, _c, _d, _e, _f;
                if (!chunk.success) {
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                const usageMetadata = value.usageMetadata;
                if (usageMetadata != null) {
                  usage = {
                    promptTokens: (_a17 = usageMetadata.promptTokenCount) != null ? _a17 : NaN,
                    completionTokens: (_b = usageMetadata.candidatesTokenCount) != null ? _b : NaN
                  };
                }
                const candidate = (_c = value.candidates) == null ? void 0 : _c[0];
                if (candidate == null) {
                  return;
                }
                const content = candidate.content;
                if (content != null) {
                  const deltaText = getTextFromParts(content.parts);
                  if (deltaText != null) {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: deltaText
                    });
                  }
                  const reasoningDeltaText = getReasoningDetailsFromParts(
                    content.parts
                  );
                  if (reasoningDeltaText != null) {
                    for (const part of reasoningDeltaText) {
                      controller.enqueue({
                        type: "reasoning",
                        textDelta: part.text
                      });
                    }
                  }
                  const inlineDataParts = getInlineDataParts(content.parts);
                  if (inlineDataParts != null) {
                    for (const part of inlineDataParts) {
                      controller.enqueue({
                        type: "file",
                        mimeType: part.inlineData.mimeType,
                        data: part.inlineData.data
                      });
                    }
                  }
                  const toolCallDeltas = getToolCallsFromParts({
                    parts: content.parts,
                    generateId: generateId2
                  });
                  if (toolCallDeltas != null) {
                    for (const toolCall of toolCallDeltas) {
                      controller.enqueue({
                        type: "tool-call-delta",
                        toolCallType: "function",
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        argsTextDelta: toolCall.args
                      });
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        args: toolCall.args
                      });
                      hasToolCalls = true;
                    }
                  }
                }
                if (candidate.finishReason != null) {
                  finishReason = mapGoogleGenerativeAIFinishReason({
                    finishReason: candidate.finishReason,
                    hasToolCalls
                  });
                  const sources = (_d = extractSources({
                    groundingMetadata: candidate.groundingMetadata,
                    generateId: generateId2
                  })) != null ? _d : [];
                  for (const source of sources) {
                    controller.enqueue({ type: "source", source });
                  }
                  providerMetadata = {
                    google: {
                      groundingMetadata: (_e = candidate.groundingMetadata) != null ? _e : null,
                      safetyRatings: (_f = candidate.safetyRatings) != null ? _f : null
                    }
                  };
                }
              },
              flush(controller) {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage,
                  providerMetadata
                });
              }
            })
          ),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders },
          warnings,
          request: { body }
        };
      }
    };
    contentSchema = external_exports.object({
      parts: external_exports.array(
        external_exports.union([
          // note: order matters since text can be fully empty
          external_exports.object({
            functionCall: external_exports.object({
              name: external_exports.string(),
              args: external_exports.unknown()
            })
          }),
          external_exports.object({
            inlineData: external_exports.object({
              mimeType: external_exports.string(),
              data: external_exports.string()
            })
          }),
          external_exports.object({
            text: external_exports.string().nullish(),
            thought: external_exports.boolean().nullish()
          })
        ])
      ).nullish()
    });
    groundingChunkSchema = external_exports.object({
      web: external_exports.object({ uri: external_exports.string(), title: external_exports.string() }).nullish(),
      retrievedContext: external_exports.object({ uri: external_exports.string(), title: external_exports.string() }).nullish()
    });
    groundingMetadataSchema = external_exports.object({
      webSearchQueries: external_exports.array(external_exports.string()).nullish(),
      retrievalQueries: external_exports.array(external_exports.string()).nullish(),
      searchEntryPoint: external_exports.object({ renderedContent: external_exports.string() }).nullish(),
      groundingChunks: external_exports.array(groundingChunkSchema).nullish(),
      groundingSupports: external_exports.array(
        external_exports.object({
          segment: external_exports.object({
            startIndex: external_exports.number().nullish(),
            endIndex: external_exports.number().nullish(),
            text: external_exports.string().nullish()
          }),
          segment_text: external_exports.string().nullish(),
          groundingChunkIndices: external_exports.array(external_exports.number()).nullish(),
          supportChunkIndices: external_exports.array(external_exports.number()).nullish(),
          confidenceScores: external_exports.array(external_exports.number()).nullish(),
          confidenceScore: external_exports.array(external_exports.number()).nullish()
        })
      ).nullish(),
      retrievalMetadata: external_exports.union([
        external_exports.object({
          webDynamicRetrievalScore: external_exports.number()
        }),
        external_exports.object({})
      ]).nullish()
    });
    safetyRatingSchema = external_exports.object({
      category: external_exports.string().nullish(),
      probability: external_exports.string().nullish(),
      probabilityScore: external_exports.number().nullish(),
      severity: external_exports.string().nullish(),
      severityScore: external_exports.number().nullish(),
      blocked: external_exports.boolean().nullish()
    });
    responseSchema = external_exports.object({
      candidates: external_exports.array(
        external_exports.object({
          content: contentSchema.nullish().or(external_exports.object({}).strict()),
          finishReason: external_exports.string().nullish(),
          safetyRatings: external_exports.array(safetyRatingSchema).nullish(),
          groundingMetadata: groundingMetadataSchema.nullish()
        })
      ),
      usageMetadata: external_exports.object({
        promptTokenCount: external_exports.number().nullish(),
        candidatesTokenCount: external_exports.number().nullish(),
        totalTokenCount: external_exports.number().nullish()
      }).nullish()
    });
    chunkSchema = external_exports.object({
      candidates: external_exports.array(
        external_exports.object({
          content: contentSchema.nullish(),
          finishReason: external_exports.string().nullish(),
          safetyRatings: external_exports.array(safetyRatingSchema).nullish(),
          groundingMetadata: groundingMetadataSchema.nullish()
        })
      ).nullish(),
      usageMetadata: external_exports.object({
        promptTokenCount: external_exports.number().nullish(),
        candidatesTokenCount: external_exports.number().nullish(),
        totalTokenCount: external_exports.number().nullish()
      }).nullish()
    });
    googleGenerativeAIProviderOptionsSchema = external_exports.object({
      responseModalities: external_exports.array(external_exports.enum(["TEXT", "IMAGE"])).nullish(),
      thinkingConfig: external_exports.object({
        thinkingBudget: external_exports.number().nullish(),
        includeThoughts: external_exports.boolean().nullish()
      }).nullish()
    });
    GoogleGenerativeAIEmbeddingModel = class {
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
      }
      get provider() {
        return this.config.provider;
      }
      get maxEmbeddingsPerCall() {
        return 2048;
      }
      get supportsParallelCalls() {
        return true;
      }
      async doEmbed({
        values,
        headers: headers9,
        abortSignal
      }) {
        if (values.length > this.maxEmbeddingsPerCall) {
          throw new TooManyEmbeddingValuesForCallError({
            provider: this.provider,
            modelId: this.modelId,
            maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
            values
          });
        }
        const mergedHeaders = combineHeaders(
          await resolve(this.config.headers),
          headers9
        );
        const { responseHeaders, value: response } = await postJsonToApi({
          url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`,
          headers: mergedHeaders,
          body: {
            requests: values.map((value) => ({
              model: `models/${this.modelId}`,
              content: { role: "user", parts: [{ text: value }] },
              outputDimensionality: this.settings.outputDimensionality,
              taskType: this.settings.taskType
            }))
          },
          failedResponseHandler: googleFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            googleGenerativeAITextEmbeddingResponseSchema
          ),
          abortSignal,
          fetch: this.config.fetch
        });
        return {
          embeddings: response.embeddings.map((item) => item.values),
          usage: void 0,
          rawResponse: { headers: responseHeaders }
        };
      }
    };
    googleGenerativeAITextEmbeddingResponseSchema = external_exports.object({
      embeddings: external_exports.array(external_exports.object({ values: external_exports.array(external_exports.number()) }))
    });
    google = createGoogleGenerativeAI();
  }
});

// node_modules/@ai-sdk/openai-compatible/dist/index.mjs
function getOpenAIMetadata(message) {
  var _a17, _b;
  return (_b = (_a17 = message == null ? void 0 : message.providerMetadata) == null ? void 0 : _a17.openaiCompatible) != null ? _b : {};
}
function convertToOpenAICompatibleChatMessages(prompt) {
  const messages = [];
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message });
    switch (role) {
      case "system": {
        messages.push({ role: "system", content, ...metadata });
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({
            role: "user",
            content: content[0].text,
            ...getOpenAIMetadata(content[0])
          });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part) => {
            var _a17;
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text, ...partMetadata };
              }
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a17 = part.mimeType) != null ? _a17 : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`
                  },
                  ...partMetadata
                };
              }
              case "file": {
                throw new UnsupportedFunctionalityError({
                  functionality: "File content parts in user messages"
                });
              }
            }
          }),
          ...metadata
        });
        break;
      }
      case "assistant": {
        let text2 = "";
        const toolCalls = [];
        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
          switch (part.type) {
            case "text": {
              text2 += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args)
                },
                ...partMetadata
              });
              break;
            }
          }
        }
        messages.push({
          role: "assistant",
          content: text2,
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
          ...metadata
        });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          const toolResponseMetadata = getOpenAIMetadata(toolResponse);
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.result),
            ...toolResponseMetadata
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return messages;
}
function getResponseMetadata2({
  id,
  model,
  created
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function mapOpenAICompatibleFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
function prepareTools4({
  mode,
  structuredOutputs
}) {
  var _a17;
  const tools = ((_a17 = mode.tools) == null ? void 0 : _a17.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const openaiCompatTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      openaiCompatTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: openaiCompatTools, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiCompatTools, tool_choice: type, toolWarnings };
    case "tool":
      return {
        tools: openaiCompatTools,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
var openaiCompatibleErrorDataSchema, defaultOpenAICompatibleErrorStructure, OpenAICompatibleChatLanguageModel, openaiCompatibleTokenUsageSchema, OpenAICompatibleChatResponseSchema, createOpenAICompatibleChatChunkSchema, openaiCompatibleCompletionResponseSchema, openaiTextEmbeddingResponseSchema2, OpenAICompatibleImageModel, openaiCompatibleImageResponseSchema;
var init_dist6 = __esm({
  "node_modules/@ai-sdk/openai-compatible/dist/index.mjs"() {
    init_dist();
    init_dist2();
    init_zod();
    init_dist();
    init_dist2();
    init_zod();
    init_dist();
    init_zod();
    init_zod();
    init_dist2();
    init_zod();
    openaiCompatibleErrorDataSchema = external_exports.object({
      error: external_exports.object({
        message: external_exports.string(),
        // The additional information below is handled loosely to support
        // OpenAI-compatible providers that have slightly different error
        // responses:
        type: external_exports.string().nullish(),
        param: external_exports.any().nullish(),
        code: external_exports.union([external_exports.string(), external_exports.number()]).nullish()
      })
    });
    defaultOpenAICompatibleErrorStructure = {
      errorSchema: openaiCompatibleErrorDataSchema,
      errorToMessage: (data) => data.error.message
    };
    OpenAICompatibleChatLanguageModel = class {
      // type inferred via constructor
      constructor(modelId, settings, config) {
        this.specificationVersion = "v1";
        var _a17, _b;
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
        const errorStructure = (_a17 = config.errorStructure) != null ? _a17 : defaultOpenAICompatibleErrorStructure;
        this.chunkSchema = createOpenAICompatibleChatChunkSchema(
          errorStructure.errorSchema
        );
        this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
        this.supportsStructuredOutputs = (_b = config.supportsStructuredOutputs) != null ? _b : false;
      }
      get defaultObjectGenerationMode() {
        return this.config.defaultObjectGenerationMode;
      }
      get provider() {
        return this.config.provider;
      }
      get providerOptionsName() {
        return this.config.provider.split(".")[0].trim();
      }
      getArgs({
        mode,
        prompt,
        maxTokens,
        temperature,
        topP,
        topK,
        frequencyPenalty,
        presencePenalty,
        providerMetadata,
        stopSequences,
        responseFormat,
        seed
      }) {
        var _a17, _b, _c, _d, _e;
        const type = mode.type;
        const warnings = [];
        if (topK != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "topK"
          });
        }
        if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
          warnings.push({
            type: "unsupported-setting",
            setting: "responseFormat",
            details: "JSON response format schema is only supported with structuredOutputs"
          });
        }
        const baseArgs = {
          // model id:
          model: this.modelId,
          // model specific settings:
          user: this.settings.user,
          // standardized settings:
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
          response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? this.supportsStructuredOutputs === true && responseFormat.schema != null ? {
            type: "json_schema",
            json_schema: {
              schema: responseFormat.schema,
              name: (_a17 = responseFormat.name) != null ? _a17 : "response",
              description: responseFormat.description
            }
          } : { type: "json_object" } : void 0,
          stop: stopSequences,
          seed,
          ...providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName],
          reasoning_effort: (_d = (_b = providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName]) == null ? void 0 : _b.reasoningEffort) != null ? _d : (_c = providerMetadata == null ? void 0 : providerMetadata["openai-compatible"]) == null ? void 0 : _c.reasoningEffort,
          // messages:
          messages: convertToOpenAICompatibleChatMessages(prompt)
        };
        switch (type) {
          case "regular": {
            const { tools, tool_choice, toolWarnings } = prepareTools4({
              mode,
              structuredOutputs: this.supportsStructuredOutputs
            });
            return {
              args: { ...baseArgs, tools, tool_choice },
              warnings: [...warnings, ...toolWarnings]
            };
          }
          case "object-json": {
            return {
              args: {
                ...baseArgs,
                response_format: this.supportsStructuredOutputs === true && mode.schema != null ? {
                  type: "json_schema",
                  json_schema: {
                    schema: mode.schema,
                    name: (_e = mode.name) != null ? _e : "response",
                    description: mode.description
                  }
                } : { type: "json_object" }
              },
              warnings
            };
          }
          case "object-tool": {
            return {
              args: {
                ...baseArgs,
                tool_choice: {
                  type: "function",
                  function: { name: mode.tool.name }
                },
                tools: [
                  {
                    type: "function",
                    function: {
                      name: mode.tool.name,
                      description: mode.tool.description,
                      parameters: mode.tool.parameters
                    }
                  }
                ]
              },
              warnings
            };
          }
          default: {
            const _exhaustiveCheck = type;
            throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
          }
        }
      }
      async doGenerate(options) {
        var _a17, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
        const { args, warnings } = this.getArgs({ ...options });
        const body = JSON.stringify(args);
        const {
          responseHeaders,
          value: responseBody,
          rawValue: rawResponse
        } = await postJsonToApi({
          url: this.config.url({
            path: "/chat/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body: args,
          failedResponseHandler: this.failedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            OpenAICompatibleChatResponseSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = args;
        const choice = responseBody.choices[0];
        const providerMetadata = {
          [this.providerOptionsName]: {},
          ...(_b = (_a17 = this.config.metadataExtractor) == null ? void 0 : _a17.extractMetadata) == null ? void 0 : _b.call(_a17, {
            parsedBody: rawResponse
          })
        };
        const completionTokenDetails = (_c = responseBody.usage) == null ? void 0 : _c.completion_tokens_details;
        const promptTokenDetails = (_d = responseBody.usage) == null ? void 0 : _d.prompt_tokens_details;
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens) != null) {
          providerMetadata[this.providerOptionsName].reasoningTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens;
        }
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens) != null) {
          providerMetadata[this.providerOptionsName].acceptedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens;
        }
        if ((completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens) != null) {
          providerMetadata[this.providerOptionsName].rejectedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens;
        }
        if ((promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens) != null) {
          providerMetadata[this.providerOptionsName].cachedPromptTokens = promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens;
        }
        return {
          text: (_e = choice.message.content) != null ? _e : void 0,
          reasoning: (_f = choice.message.reasoning_content) != null ? _f : void 0,
          toolCalls: (_g = choice.message.tool_calls) == null ? void 0 : _g.map((toolCall) => {
            var _a23;
            return {
              toolCallType: "function",
              toolCallId: (_a23 = toolCall.id) != null ? _a23 : generateId(),
              toolName: toolCall.function.name,
              args: toolCall.function.arguments
            };
          }),
          finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
          usage: {
            promptTokens: (_i = (_h = responseBody.usage) == null ? void 0 : _h.prompt_tokens) != null ? _i : NaN,
            completionTokens: (_k = (_j = responseBody.usage) == null ? void 0 : _j.completion_tokens) != null ? _k : NaN
          },
          providerMetadata,
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders, body: rawResponse },
          response: getResponseMetadata2(responseBody),
          warnings,
          request: { body }
        };
      }
      async doStream(options) {
        var _a17;
        if (this.settings.simulateStreaming) {
          const result = await this.doGenerate(options);
          const simulatedStream = new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "response-metadata", ...result.response });
              if (result.reasoning) {
                if (Array.isArray(result.reasoning)) {
                  for (const part of result.reasoning) {
                    if (part.type === "text") {
                      controller.enqueue({
                        type: "reasoning",
                        textDelta: part.text
                      });
                    }
                  }
                } else {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: result.reasoning
                  });
                }
              }
              if (result.text) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: result.text
                });
              }
              if (result.toolCalls) {
                for (const toolCall of result.toolCalls) {
                  controller.enqueue({
                    type: "tool-call",
                    ...toolCall
                  });
                }
              }
              controller.enqueue({
                type: "finish",
                finishReason: result.finishReason,
                usage: result.usage,
                logprobs: result.logprobs,
                providerMetadata: result.providerMetadata
              });
              controller.close();
            }
          });
          return {
            stream: simulatedStream,
            rawCall: result.rawCall,
            rawResponse: result.rawResponse,
            warnings: result.warnings
          };
        }
        const { args, warnings } = this.getArgs({ ...options });
        const body = {
          ...args,
          stream: true,
          // only include stream_options when in strict compatibility mode:
          stream_options: this.config.includeUsage ? { include_usage: true } : void 0
        };
        const metadataExtractor = (_a17 = this.config.metadataExtractor) == null ? void 0 : _a17.createStreamExtractor();
        const { responseHeaders, value: response } = await postJsonToApi({
          url: this.config.url({
            path: "/chat/completions",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          body,
          failedResponseHandler: this.failedResponseHandler,
          successfulResponseHandler: createEventSourceResponseHandler(
            this.chunkSchema
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch
        });
        const { messages: rawPrompt, ...rawSettings } = args;
        const toolCalls = [];
        let finishReason = "unknown";
        let usage = {
          completionTokens: void 0,
          completionTokensDetails: {
            reasoningTokens: void 0,
            acceptedPredictionTokens: void 0,
            rejectedPredictionTokens: void 0
          },
          promptTokens: void 0,
          promptTokensDetails: {
            cachedTokens: void 0
          }
        };
        let isFirstChunk = true;
        let providerOptionsName = this.providerOptionsName;
        return {
          stream: response.pipeThrough(
            new TransformStream({
              // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
              transform(chunk, controller) {
                var _a23, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
                if (!chunk.success) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: chunk.error });
                  return;
                }
                const value = chunk.value;
                metadataExtractor == null ? void 0 : metadataExtractor.processChunk(chunk.rawValue);
                if ("error" in value) {
                  finishReason = "error";
                  controller.enqueue({ type: "error", error: value.error.message });
                  return;
                }
                if (isFirstChunk) {
                  isFirstChunk = false;
                  controller.enqueue({
                    type: "response-metadata",
                    ...getResponseMetadata2(value)
                  });
                }
                if (value.usage != null) {
                  const {
                    prompt_tokens,
                    completion_tokens,
                    prompt_tokens_details,
                    completion_tokens_details
                  } = value.usage;
                  usage.promptTokens = prompt_tokens != null ? prompt_tokens : void 0;
                  usage.completionTokens = completion_tokens != null ? completion_tokens : void 0;
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens) != null) {
                    usage.completionTokensDetails.reasoningTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens;
                  }
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens) != null) {
                    usage.completionTokensDetails.acceptedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens;
                  }
                  if ((completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens) != null) {
                    usage.completionTokensDetails.rejectedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens;
                  }
                  if ((prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens) != null) {
                    usage.promptTokensDetails.cachedTokens = prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens;
                  }
                }
                const choice = value.choices[0];
                if ((choice == null ? void 0 : choice.finish_reason) != null) {
                  finishReason = mapOpenAICompatibleFinishReason(
                    choice.finish_reason
                  );
                }
                if ((choice == null ? void 0 : choice.delta) == null) {
                  return;
                }
                const delta = choice.delta;
                if (delta.reasoning_content != null) {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: delta.reasoning_content
                  });
                }
                if (delta.content != null) {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: delta.content
                  });
                }
                if (delta.tool_calls != null) {
                  for (const toolCallDelta of delta.tool_calls) {
                    const index = toolCallDelta.index;
                    if (toolCalls[index] == null) {
                      if (toolCallDelta.type !== "function") {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'function' type.`
                        });
                      }
                      if (toolCallDelta.id == null) {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'id' to be a string.`
                        });
                      }
                      if (((_a23 = toolCallDelta.function) == null ? void 0 : _a23.name) == null) {
                        throw new InvalidResponseDataError({
                          data: toolCallDelta,
                          message: `Expected 'function.name' to be a string.`
                        });
                      }
                      toolCalls[index] = {
                        id: toolCallDelta.id,
                        type: "function",
                        function: {
                          name: toolCallDelta.function.name,
                          arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                        },
                        hasFinished: false
                      };
                      const toolCall2 = toolCalls[index];
                      if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null) {
                        if (toolCall2.function.arguments.length > 0) {
                          controller.enqueue({
                            type: "tool-call-delta",
                            toolCallType: "function",
                            toolCallId: toolCall2.id,
                            toolName: toolCall2.function.name,
                            argsTextDelta: toolCall2.function.arguments
                          });
                        }
                        if (isParsableJson(toolCall2.function.arguments)) {
                          controller.enqueue({
                            type: "tool-call",
                            toolCallType: "function",
                            toolCallId: (_e = toolCall2.id) != null ? _e : generateId(),
                            toolName: toolCall2.function.name,
                            args: toolCall2.function.arguments
                          });
                          toolCall2.hasFinished = true;
                        }
                      }
                      continue;
                    }
                    const toolCall = toolCalls[index];
                    if (toolCall.hasFinished) {
                      continue;
                    }
                    if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                      toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                    }
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : ""
                    });
                    if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: (_l = toolCall.id) != null ? _l : generateId(),
                        toolName: toolCall.function.name,
                        args: toolCall.function.arguments
                      });
                      toolCall.hasFinished = true;
                    }
                  }
                }
              },
              flush(controller) {
                var _a23, _b;
                const providerMetadata = {
                  [providerOptionsName]: {},
                  ...metadataExtractor == null ? void 0 : metadataExtractor.buildMetadata()
                };
                if (usage.completionTokensDetails.reasoningTokens != null) {
                  providerMetadata[providerOptionsName].reasoningTokens = usage.completionTokensDetails.reasoningTokens;
                }
                if (usage.completionTokensDetails.acceptedPredictionTokens != null) {
                  providerMetadata[providerOptionsName].acceptedPredictionTokens = usage.completionTokensDetails.acceptedPredictionTokens;
                }
                if (usage.completionTokensDetails.rejectedPredictionTokens != null) {
                  providerMetadata[providerOptionsName].rejectedPredictionTokens = usage.completionTokensDetails.rejectedPredictionTokens;
                }
                if (usage.promptTokensDetails.cachedTokens != null) {
                  providerMetadata[providerOptionsName].cachedPromptTokens = usage.promptTokensDetails.cachedTokens;
                }
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage: {
                    promptTokens: (_a23 = usage.promptTokens) != null ? _a23 : NaN,
                    completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
                  },
                  providerMetadata
                });
              }
            })
          ),
          rawCall: { rawPrompt, rawSettings },
          rawResponse: { headers: responseHeaders },
          warnings,
          request: { body: JSON.stringify(body) }
        };
      }
    };
    openaiCompatibleTokenUsageSchema = external_exports.object({
      prompt_tokens: external_exports.number().nullish(),
      completion_tokens: external_exports.number().nullish(),
      prompt_tokens_details: external_exports.object({
        cached_tokens: external_exports.number().nullish()
      }).nullish(),
      completion_tokens_details: external_exports.object({
        reasoning_tokens: external_exports.number().nullish(),
        accepted_prediction_tokens: external_exports.number().nullish(),
        rejected_prediction_tokens: external_exports.number().nullish()
      }).nullish()
    }).nullish();
    OpenAICompatibleChatResponseSchema = external_exports.object({
      id: external_exports.string().nullish(),
      created: external_exports.number().nullish(),
      model: external_exports.string().nullish(),
      choices: external_exports.array(
        external_exports.object({
          message: external_exports.object({
            role: external_exports.literal("assistant").nullish(),
            content: external_exports.string().nullish(),
            reasoning_content: external_exports.string().nullish(),
            tool_calls: external_exports.array(
              external_exports.object({
                id: external_exports.string().nullish(),
                type: external_exports.literal("function"),
                function: external_exports.object({
                  name: external_exports.string(),
                  arguments: external_exports.string()
                })
              })
            ).nullish()
          }),
          finish_reason: external_exports.string().nullish()
        })
      ),
      usage: openaiCompatibleTokenUsageSchema
    });
    createOpenAICompatibleChatChunkSchema = (errorSchema) => external_exports.union([
      external_exports.object({
        id: external_exports.string().nullish(),
        created: external_exports.number().nullish(),
        model: external_exports.string().nullish(),
        choices: external_exports.array(
          external_exports.object({
            delta: external_exports.object({
              role: external_exports.enum(["assistant"]).nullish(),
              content: external_exports.string().nullish(),
              reasoning_content: external_exports.string().nullish(),
              tool_calls: external_exports.array(
                external_exports.object({
                  index: external_exports.number().optional(),
                  id: external_exports.string().nullish(),
                  type: external_exports.literal("function").nullish(),
                  function: external_exports.object({
                    name: external_exports.string().nullish(),
                    arguments: external_exports.string().nullish()
                  })
                })
              ).nullish()
            }).nullish(),
            finish_reason: external_exports.string().nullish()
          })
        ),
        usage: openaiCompatibleTokenUsageSchema
      }),
      errorSchema
    ]);
    openaiCompatibleCompletionResponseSchema = external_exports.object({
      id: external_exports.string().nullish(),
      created: external_exports.number().nullish(),
      model: external_exports.string().nullish(),
      choices: external_exports.array(
        external_exports.object({
          text: external_exports.string(),
          finish_reason: external_exports.string()
        })
      ),
      usage: external_exports.object({
        prompt_tokens: external_exports.number(),
        completion_tokens: external_exports.number()
      }).nullish()
    });
    openaiTextEmbeddingResponseSchema2 = external_exports.object({
      data: external_exports.array(external_exports.object({ embedding: external_exports.array(external_exports.number()) })),
      usage: external_exports.object({ prompt_tokens: external_exports.number() }).nullish()
    });
    OpenAICompatibleImageModel = class {
      constructor(modelId, settings, config) {
        this.modelId = modelId;
        this.settings = settings;
        this.config = config;
        this.specificationVersion = "v1";
      }
      get maxImagesPerCall() {
        var _a17;
        return (_a17 = this.settings.maxImagesPerCall) != null ? _a17 : 10;
      }
      get provider() {
        return this.config.provider;
      }
      async doGenerate({
        prompt,
        n,
        size,
        aspectRatio,
        seed,
        providerOptions,
        headers: headers9,
        abortSignal
      }) {
        var _a17, _b, _c, _d, _e;
        const warnings = [];
        if (aspectRatio != null) {
          warnings.push({
            type: "unsupported-setting",
            setting: "aspectRatio",
            details: "This model does not support aspect ratio. Use `size` instead."
          });
        }
        if (seed != null) {
          warnings.push({ type: "unsupported-setting", setting: "seed" });
        }
        const currentDate = (_c = (_b = (_a17 = this.config._internal) == null ? void 0 : _a17.currentDate) == null ? void 0 : _b.call(_a17)) != null ? _c : /* @__PURE__ */ new Date();
        const { value: response, responseHeaders } = await postJsonToApi({
          url: this.config.url({
            path: "/images/generations",
            modelId: this.modelId
          }),
          headers: combineHeaders(this.config.headers(), headers9),
          body: {
            model: this.modelId,
            prompt,
            n,
            size,
            ...(_d = providerOptions.openai) != null ? _d : {},
            response_format: "b64_json",
            ...this.settings.user ? { user: this.settings.user } : {}
          },
          failedResponseHandler: createJsonErrorResponseHandler(
            (_e = this.config.errorStructure) != null ? _e : defaultOpenAICompatibleErrorStructure
          ),
          successfulResponseHandler: createJsonResponseHandler(
            openaiCompatibleImageResponseSchema
          ),
          abortSignal,
          fetch: this.config.fetch
        });
        return {
          images: response.data.map((item) => item.b64_json),
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: responseHeaders
          }
        };
      }
    };
    openaiCompatibleImageResponseSchema = external_exports.object({
      data: external_exports.array(external_exports.object({ b64_json: external_exports.string() }))
    });
  }
});

// node_modules/@ai-sdk/xai/dist/index.mjs
var dist_exports4 = {};
__export(dist_exports4, {
  createXai: () => createXai,
  xai: () => xai
});
function supportsStructuredOutputs(modelId) {
  return [
    "grok-3",
    "grok-3-beta",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-fast-beta",
    "grok-3-fast-latest",
    "grok-3-mini",
    "grok-3-mini-beta",
    "grok-3-mini-latest",
    "grok-3-mini-fast",
    "grok-3-mini-fast-beta",
    "grok-3-mini-fast-latest",
    "grok-2-1212",
    "grok-2-vision-1212"
  ].includes(modelId);
}
function createXai(options = {}) {
  var _a17;
  const baseURL = withoutTrailingSlash(
    (_a17 = options.baseURL) != null ? _a17 : "https://api.x.ai/v1"
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "XAI_API_KEY",
      description: "xAI API key"
    })}`,
    ...options.headers
  });
  const createLanguageModel = (modelId, settings = {}) => {
    const structuredOutputs = supportsStructuredOutputs(modelId);
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: "xai.chat",
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: structuredOutputs ? "json" : "tool",
      errorStructure: xaiErrorStructure,
      supportsStructuredOutputs: structuredOutputs,
      includeUsage: true
    });
  };
  const createImageModel = (modelId, settings = {}) => {
    return new OpenAICompatibleImageModel(modelId, settings, {
      provider: "xai.image",
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: xaiErrorStructure
    });
  };
  const provider = (modelId, settings) => createLanguageModel(modelId, settings);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  return provider;
}
var xaiErrorSchema, xaiErrorStructure, xai;
var init_dist7 = __esm({
  "node_modules/@ai-sdk/xai/dist/index.mjs"() {
    init_dist();
    init_dist6();
    init_dist2();
    init_zod();
    xaiErrorSchema = external_exports.object({
      code: external_exports.string(),
      error: external_exports.string()
    });
    xaiErrorStructure = {
      errorSchema: xaiErrorSchema,
      errorToMessage: (data) => data.error
    };
    xai = createXai();
  }
});

// cli.ts
import { parseArgs } from "node:util";

// pipeline_core/connectors/registry.ts
var REGISTRY = /* @__PURE__ */ new Map();
function registerConnector(connector) {
  REGISTRY.set(connector.name, connector);
}
function getConnectors() {
  return [...REGISTRY.values()];
}
function getConfiguredConnectors(phase) {
  return getConnectors().filter(
    (c) => c.phases.includes(phase) && c.isConfigured()
  );
}
function getSkippedConnectors(phase) {
  return getConnectors().filter(
    (c) => c.phases.includes(phase) && !c.isConfigured()
  );
}

// pipeline_core/http.ts
var HttpError = class extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.status = status;
    this.url = url;
    this.body = body;
    this.name = "HttpError";
  }
  status;
  url;
  body;
};
var SECRET_PARAMS = /* @__PURE__ */ new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
  "user_key",
  "auth"
]);
function redactUrl(raw) {
  let u;
  try {
    u = new URL(raw.toString());
  } catch {
    return "[unparseable url]";
  }
  for (const k of [...u.searchParams.keys()]) {
    if (SECRET_PARAMS.has(k.toLowerCase())) u.searchParams.set(k, "REDACTED");
  }
  return `${u.origin}${u.pathname}${u.search}`;
}
async function httpJson(url, opts = {}) {
  const { method = "GET", headers: headers9 = {}, json, query, timeoutMs = 2e4 } = opts;
  const u = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== void 0) u.searchParams.set(k, String(v));
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      method,
      headers: {
        Accept: "application/json",
        ...json !== void 0 ? { "Content-Type": "application/json" } : {},
        ...headers9
      },
      body: json !== void 0 ? JSON.stringify(json) : void 0,
      signal: controller.signal
    });
    const text2 = await res.text();
    if (!res.ok) throw new HttpError(res.status, redactUrl(u), text2);
    return text2 ? JSON.parse(text2) : {};
  } finally {
    clearTimeout(timer);
  }
}

// pipeline_core/secrets.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
var MissingSecretError = class extends Error {
  constructor(name17) {
    super(
      `secret "${name17}" not found. Set the ${name17} environment variable, or add it to ${localSecretsPath()}. Intent Outreach never stores keys in the cloud.`
    );
    this.name = name17;
    this.name = "MissingSecretError";
  }
  name;
};
function localSecretsPath() {
  return process.env.INTENT_OUTREACH_SECRETS_FILE ?? join(process.env.INTENT_OUTREACH_HOME ?? join(homedir(), ".intent-outreach"), "secrets.json");
}
var fileCache = null;
function loadLocalFile() {
  if (fileCache) return fileCache;
  try {
    const text2 = readFileSync(localSecretsPath(), "utf8");
    const parsed = JSON.parse(text2);
    fileCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    fileCache = {};
  }
  return fileCache;
}
function getSecret(name17) {
  const fromEnv = process.env[name17];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const fromFile = loadLocalFile()[name17];
  if (fromFile && fromFile.length > 0) return fromFile;
  throw new MissingSecretError(name17);
}
function hasSecret(name17) {
  if (process.env[name17]) return true;
  return Boolean(loadLocalFile()[name17]);
}

// pipeline_core/connectors/apollo.ts
var BASE = "https://api.apollo.io/api/v1";
var KEY_ENV = "APOLLO_API_KEY";
function headers() {
  return { "X-Api-Key": getSecret(KEY_ENV) };
}
function orgToLead(org, fallbackDomain) {
  return {
    domain: org.primary_domain ?? fallbackDomain,
    companyName: org.name ?? fallbackDomain,
    industry: org.industry,
    size: org.estimated_num_employees !== void 0 ? String(org.estimated_num_employees) : void 0,
    description: org.short_description,
    source: "apollo"
  };
}
function personToContact(p, domain) {
  const name17 = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  return {
    name: name17 || "(unknown)",
    leadDomain: domain,
    email: p.email && p.email.includes("@") ? p.email : void 0,
    title: p.title,
    linkedin: p.linkedin_url,
    source: "apollo"
  };
}
var apolloConnector = {
  name: "apollo",
  displayName: "Apollo.io",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Self-serve key; 50 free credits/mo. Covers company, people, and enrichment.",
  isConfigured() {
    return hasSecret(KEY_ENV);
  },
  async research({ domain, icp }) {
    const orgRes = await httpJson(
      `${BASE}/organizations/api_search`,
      { method: "POST", headers: headers(), json: { q_organization_domains: [domain], per_page: 1 } }
    );
    const org = orgRes.organization ?? orgRes.organizations?.[0] ?? { primary_domain: domain };
    const lead = orgToLead(org, domain);
    const peopleRes = await httpJson(
      `${BASE}/mixed_people/api_search`,
      {
        method: "POST",
        headers: headers(),
        json: { q_organization_domains: [domain], q_keywords: icp, per_page: 10 }
      }
    );
    const contacts = (peopleRes.people ?? []).map((p) => personToContact(p, lead.domain));
    return { leads: [lead], contacts, raw: { org: orgRes, people: peopleRes } };
  },
  async enrich({ lead, contacts }) {
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    if (needy.length === 0) return { enrichments: [] };
    const res = await httpJson(`${BASE}/people/bulk_match`, {
      method: "POST",
      headers: headers(),
      json: {
        details: needy.map((c) => ({ name: c.name, domain: lead.domain })),
        reveal_personal_emails: false
      }
    });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = (res.matches ?? []).filter((m) => Boolean(m && m.email)).map((m) => ({
      subjectType: "contact",
      subjectKey: m.email,
      provider: "apollo",
      verifiedEmail: m.email,
      phone: m.phone_numbers?.[0]?.raw_number,
      data: m,
      fetchedAt: now
    }));
    return { enrichments, raw: res };
  }
};

// pipeline_core/connectors/hunter.ts
var BASE2 = "https://api.hunter.io/v2";
var KEY_ENV2 = "HUNTER_API_KEY";
var hunterConnector = {
  name: "hunter",
  displayName: "Hunter.io",
  tier: "free",
  keyEnvVar: KEY_ENV2,
  phases: ["research", "enrich"],
  note: "Self-serve key; 50 free searches/mo. Email finding + verification.",
  isConfigured() {
    return hasSecret(KEY_ENV2);
  },
  async research({ domain }) {
    const res = await httpJson(`${BASE2}/domain-search`, {
      query: { domain, api_key: getSecret(KEY_ENV2), limit: 10 }
    });
    const org = res.data?.organization;
    const lead = {
      domain,
      companyName: org ?? domain,
      source: "hunter"
    };
    const contacts = (res.data?.emails ?? []).map((e) => ({
      name: [e.first_name, e.last_name].filter(Boolean).join(" ") || "(unknown)",
      leadDomain: domain,
      email: e.value && e.value.includes("@") ? e.value : void 0,
      title: e.position,
      linkedin: e.linkedin ?? void 0,
      source: "hunter"
    }));
    return { leads: [lead], contacts, raw: res };
  },
  async enrich({ lead, contacts }) {
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = [];
    for (const c of needy) {
      const res = await httpJson(`${BASE2}/email-finder`, {
        query: { domain: lead.domain, full_name: c.name, api_key: getSecret(KEY_ENV2) }
      });
      const email = res.data?.email;
      if (email && email.includes("@")) {
        enrichments.push({
          subjectType: "contact",
          subjectKey: email,
          provider: "hunter",
          verifiedEmail: email,
          data: res.data ?? {},
          fetchedAt: now
        });
      }
    }
    return { enrichments };
  }
};

// pipeline_core/connectors/peopledatalabs.ts
var BASE3 = "https://api.peopledatalabs.com/v5";
var KEY_ENV3 = "PDL_API_KEY";
function headers2() {
  return { "X-Api-Key": getSecret(KEY_ENV3) };
}
function bestEmail(p) {
  if (p.work_email && p.work_email.includes("@")) return p.work_email;
  const personal = p.personal_emails?.find((e) => e.includes("@"));
  return personal;
}
var peopledatalabsConnector = {
  name: "peopledatalabs",
  displayName: "People Data Labs",
  tier: "free",
  keyEnvVar: KEY_ENV3,
  phases: ["research", "enrich"],
  note: "Self-serve key; 100 free/mo. Structured person & company enrichment.",
  isConfigured() {
    return hasSecret(KEY_ENV3);
  },
  async research({ domain }) {
    const companyRes = await httpJson(
      `${BASE3}/company/enrich`,
      { query: { website: domain }, headers: headers2() }
    );
    const co = companyRes.data ?? {
      name: companyRes.name,
      industry: companyRes.industry,
      employee_count: companyRes.employee_count,
      summary: companyRes.summary
    };
    const lead = {
      domain,
      companyName: co.name ?? domain,
      industry: co.industry ?? void 0,
      size: typeof co.employee_count === "number" ? String(co.employee_count) : void 0,
      description: co.summary ?? void 0,
      source: "peopledatalabs"
    };
    let contacts = [];
    try {
      const personRes = await httpJson(
        `${BASE3}/person/search`,
        {
          method: "POST",
          headers: headers2(),
          json: {
            query: {
              bool: {
                must: [{ term: { "job_company_website": domain } }]
              }
            },
            size: 10
          }
        }
      );
      const people = personRes.data ?? personRes.items ?? [];
      contacts = people.map((p) => {
        const name17 = p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || "(unknown)");
        const email = bestEmail(p);
        return {
          name: name17,
          leadDomain: domain,
          email: email && email.includes("@") ? email : void 0,
          title: p.job_title ?? void 0,
          linkedin: p.linkedin_url ?? void 0,
          source: "peopledatalabs"
        };
      });
    } catch {
      contacts = [];
    }
    return { leads: [lead], contacts, raw: { company: companyRes } };
  },
  async enrich({ contacts }) {
    const withEmail = contacts.filter((c) => c.email).slice(0, 10);
    if (withEmail.length === 0) return { enrichments: [] };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = [];
    for (const contact of withEmail) {
      const email = contact.email;
      const res = await httpJson(
        `${BASE3}/person/enrich`,
        { query: { email }, headers: headers2() }
      );
      const p = res.data ?? {
        full_name: res.full_name,
        work_email: res.work_email,
        personal_emails: res.personal_emails,
        phone_numbers: res.phone_numbers
      };
      const verifiedEmail = bestEmail(p) ?? email;
      const phone = p.phone_numbers?.[0] ?? void 0;
      enrichments.push({
        subjectType: "contact",
        subjectKey: email,
        provider: "peopledatalabs",
        verifiedEmail: verifiedEmail.includes("@") ? verifiedEmail : void 0,
        phone: typeof phone === "string" ? phone : void 0,
        data: res.data ?? res,
        fetchedAt: now
      });
    }
    return { enrichments };
  }
};

// pipeline_core/connectors/exa.ts
var BASE4 = "https://api.exa.ai";
var KEY_ENV4 = "EXA_API_KEY";
function headers3() {
  return { "x-api-key": getSecret(KEY_ENV4) };
}
function topSnippet(result) {
  const raw = result.highlights?.[0] ?? result.text?.slice(0, 200) ?? result.title;
  return raw?.trim() || void 0;
}
var exaConnector = {
  name: "exa",
  displayName: "Exa",
  tier: "free",
  keyEnvVar: KEY_ENV4,
  phases: ["research", "enrich"],
  note: "Self-serve key; 1k free/mo. Web research context (news, funding mentions), not contact records.",
  isConfigured() {
    return hasSecret(KEY_ENV4);
  },
  async research({ domain }) {
    const res = await httpJson(`${BASE4}/search`, {
      method: "POST",
      headers: headers3(),
      json: { query: "company at " + domain, numResults: 5, type: "auto" }
    });
    const top = res.results?.[0];
    const lead = {
      domain,
      companyName: domain,
      description: top !== void 0 ? topSnippet(top) : void 0,
      source: "exa"
    };
    return { leads: [lead], contacts: [], raw: res };
  },
  async enrich({ lead }) {
    const res = await httpJson(`${BASE4}/search`, {
      method: "POST",
      headers: headers3(),
      json: {
        query: lead.companyName + " funding news 2026",
        numResults: 5
      }
    });
    const results = res.results ?? [];
    const webContext = results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? ""
    }));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "exa",
      data: { webContext, _raw: res },
      fetchedAt: now
    };
    return { enrichments: [enrichment], raw: res };
  }
};

// pipeline_core/connectors/crunchbase.ts
var BASE5 = "https://api.crunchbase.com/v4/data";
var KEY_ENV5 = "CRUNCHBASE_API_KEY";
function headers4() {
  return { "X-cb-user-key": getSecret(KEY_ENV5) };
}
var crunchbaseConnector = {
  name: "crunchbase",
  displayName: "Crunchbase",
  tier: "paid",
  keyEnvVar: KEY_ENV5,
  phases: ["enrich"],
  note: "Paid (Pro $99/mo+); funding, investors, valuation. Free tier discontinued.",
  isConfigured() {
    return hasSecret(KEY_ENV5);
  },
  async enrich({ lead }) {
    const res = await httpJson(
      `${BASE5}/searches/organizations`,
      {
        method: "POST",
        headers: headers4(),
        json: {
          field_ids: [
            "funding_total",
            "last_funding_type",
            "last_funding_at",
            "num_funding_rounds",
            "investors",
            "website_url"
          ],
          predicate: {
            field_id: "website_url",
            operator_id: "domain_eq",
            values: [lead.domain]
          },
          limit: 1
        }
      }
    );
    const entity = res.entities?.[0];
    const props = entity?.properties ?? {};
    const investors = (props.investors ?? []).map((i) => i?.identifier?.value).filter((v) => typeof v === "string" && v.length > 0);
    const totalRaisedRaw = props.funding_total?.value_usd;
    const funding = {
      lastRound: props.last_funding_type ?? void 0,
      totalRaisedUsd: typeof totalRaisedRaw === "number" && totalRaisedRaw >= 0 ? totalRaisedRaw : void 0,
      lastRoundDate: props.last_funding_at ?? void 0,
      investors: investors.length > 0 ? investors : void 0
    };
    const enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "crunchbase",
      funding,
      data: entity ?? {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return { enrichments: [enrichment], raw: res };
  }
};

// pipeline_core/connectors/leadmagic.ts
var BASE6 = "https://api.leadmagic.io";
var KEY_ENV6 = "LEADMAGIC_API_KEY";
function headers5() {
  return { "X-API-Key": getSecret(KEY_ENV6) };
}
function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
}
var leadmagicConnector = {
  name: "leadmagic",
  displayName: "LeadMagic",
  tier: "paid",
  keyEnvVar: KEY_ENV6,
  phases: ["enrich"],
  note: "Paid ($49/mo); email + mobile finding, company enrichment, AI-native.",
  isConfigured() {
    return hasSecret(KEY_ENV6);
  },
  async enrich({ lead, contacts }) {
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    if (needy.length === 0) return { enrichments: [] };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = [];
    for (const c of needy) {
      const { first, last } = splitName(c.name);
      const res = await httpJson(
        `${BASE6}/email-finder`,
        {
          method: "POST",
          headers: headers5(),
          json: {
            first_name: first,
            last_name: last,
            domain: lead.domain
          }
        }
      );
      const email = res.email;
      if (!email || !email.includes("@")) continue;
      enrichments.push({
        subjectType: "contact",
        subjectKey: email,
        provider: "leadmagic",
        verifiedEmail: email,
        data: res,
        fetchedAt: now
      });
    }
    return { enrichments };
  }
};

// pipeline_core/connectors/clay.ts
var KEY_ENV7 = "CLAY_API_KEY";
var WEBHOOK_ENV = "CLAY_WEBHOOK_URL";
function headers6() {
  return { Authorization: `Bearer ${getSecret(KEY_ENV7)}` };
}
var clayConnector = {
  name: "clay",
  displayName: "Clay",
  tier: "paid",
  keyEnvVar: KEY_ENV7,
  phases: ["research"],
  note: "Middleware, not a direct data source. Push-only: requires a configured Clay table webhook (CLAY_WEBHOOK_URL); results return asynchronously into the user's Clay workspace, not synchronously here.",
  isConfigured() {
    return hasSecret(KEY_ENV7) && hasSecret(WEBHOOK_ENV);
  },
  async research({ domain, icp }) {
    try {
      await httpJson(getSecret(WEBHOOK_ENV), {
        method: "POST",
        headers: headers6(),
        json: { domain, icp }
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : "error";
      throw new Error(`Clay webhook push failed (${status})`);
    }
    return {
      leads: [],
      contacts: [],
      raw: { pushed: domain }
    };
  }
};

// pipeline_core/connectors/clearbit.ts
var PERSON_BASE = "https://person.clearbit.com/v2";
var COMPANY_BASE = "https://company.clearbit.com/v2";
var KEY_ENV8 = "CLEARBIT_API_KEY";
function headers7() {
  return { Authorization: `Bearer ${getSecret(KEY_ENV8)}` };
}
async function tryFetch(url, query) {
  const result = await httpJson(url, { method: "GET", headers: headers7(), query });
  if (!result || typeof result !== "object" || Object.keys(result).length === 0) {
    return null;
  }
  return result;
}
var clearbitConnector = {
  name: "clearbit",
  displayName: "Clearbit (legacy)",
  tier: "legacy",
  keyEnvVar: KEY_ENV8,
  phases: ["enrich"],
  note: "Legacy: new API keys are no longer issued (folded into HubSpot Breeze). Works only with a pre-2024 key.",
  isConfigured() {
    return hasSecret(KEY_ENV8);
  },
  async enrich({ lead, contacts }) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = [];
    const withEmail = contacts.filter((c) => Boolean(c.email)).slice(0, 10);
    for (const contact of withEmail) {
      const person = await tryFetch(`${PERSON_BASE}/people/find`, {
        email: contact.email
      });
      if (person) {
        enrichments.push({
          subjectType: "contact",
          subjectKey: contact.email,
          provider: "clearbit",
          verifiedEmail: contact.email,
          phone: typeof person.phone === "string" ? person.phone : void 0,
          data: person,
          fetchedAt: now
        });
      }
    }
    if (lead.domain) {
      const company = await tryFetch(`${COMPANY_BASE}/companies/find`, {
        domain: lead.domain
      });
      if (company) {
        enrichments.push({
          subjectType: "lead",
          subjectKey: lead.domain,
          provider: "clearbit",
          data: company,
          fetchedAt: now
        });
      }
    }
    return { enrichments };
  }
};

// pipeline_core/connectors/zoominfo.ts
var BASE7 = "https://api.zoominfo.com";
var KEY_ENV9 = "ZOOMINFO_JWT";
function headers8() {
  return { Authorization: `Bearer ${getSecret(KEY_ENV9)}` };
}
function ziCompanyToLead(c, fallbackDomain) {
  return {
    domain: typeof c.website === "string" && c.website.length > 0 ? c.website : fallbackDomain,
    companyName: typeof c.name === "string" && c.name.length > 0 ? c.name : fallbackDomain,
    industry: typeof c.primaryIndustry === "string" ? c.primaryIndustry : void 0,
    size: c.employeeCount !== void 0 ? String(c.employeeCount) : void 0,
    description: typeof c.description === "string" ? c.description : void 0,
    source: "zoominfo"
  };
}
function ziContactToContact(p, domain) {
  const name17 = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(unknown)";
  const email = typeof p.email === "string" && p.email.includes("@") ? p.email : void 0;
  const linkedin = typeof p.linkedInUrl === "string" && p.linkedInUrl.startsWith("http") ? p.linkedInUrl : void 0;
  return {
    name: name17,
    leadDomain: domain,
    email,
    title: typeof p.jobTitle === "string" ? p.jobTitle : void 0,
    linkedin,
    source: "zoominfo"
  };
}
var zoominfoConnector = {
  name: "zoominfo",
  displayName: "ZoomInfo",
  tier: "enterprise",
  keyEnvVar: KEY_ENV9,
  phases: ["research", "enrich"],
  note: "Enterprise contract required. Set ZOOMINFO_JWT (a bearer token obtained via ZoomInfo PKI/JWT auth).",
  isConfigured() {
    return hasSecret(KEY_ENV9);
  },
  async research({ domain, icp }) {
    const companyRes = await httpJson(`${BASE7}/search/company`, {
      method: "POST",
      headers: headers8(),
      json: { companyWebsite: domain }
    });
    const company = (companyRes.data ?? [])[0];
    const lead = company ? ziCompanyToLead(company, domain) : { domain, companyName: domain, source: "zoominfo" };
    const contactRes = await httpJson(`${BASE7}/search/contact`, {
      method: "POST",
      headers: headers8(),
      json: { companyWebsite: domain, keywords: icp, maxResults: 10 }
    });
    const contacts = (contactRes.data ?? []).slice(0, 10).map((p) => ziContactToContact(p, lead.domain));
    return {
      leads: [lead],
      contacts,
      raw: { company: companyRes, contacts: contactRes }
    };
  },
  async enrich({ lead, contacts }) {
    const withEmail = contacts.filter((c) => Boolean(c.email)).slice(0, 10);
    if (withEmail.length === 0) return { enrichments: [] };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const enrichments = [];
    for (const contact of withEmail) {
      const res = await httpJson(`${BASE7}/enrich/contact`, {
        method: "POST",
        headers: headers8(),
        json: { email: contact.email }
      });
      const match = (res.data ?? [])[0];
      if (!match) continue;
      const phone = typeof match.mobilePhone === "string" && match.mobilePhone.length > 0 ? match.mobilePhone : typeof match.directPhone === "string" && match.directPhone.length > 0 ? match.directPhone : void 0;
      enrichments.push({
        subjectType: "contact",
        subjectKey: contact.email,
        provider: "zoominfo",
        verifiedEmail: contact.email,
        phone,
        data: match,
        fetchedAt: now
      });
    }
    return { enrichments };
  }
};

// pipeline_core/connectors/index.ts
var registered = false;
function registerBuiltinConnectors() {
  if (registered) return;
  registerConnector(apolloConnector);
  registerConnector(hunterConnector);
  registerConnector(peopledatalabsConnector);
  registerConnector(exaConnector);
  registerConnector(crunchbaseConnector);
  registerConnector(leadmagicConnector);
  registerConnector(clayConnector);
  registerConnector(clearbitConnector);
  registerConnector(zoominfoConnector);
  registered = true;
}

// pipeline_core/models.ts
init_zod();
var SCHEMA_VERSION = 1;
var SourceSchema = external_exports.string().min(1);
var LeadSchema = external_exports.object({
  domain: external_exports.string().min(1),
  companyName: external_exports.string().min(1),
  industry: external_exports.string().optional(),
  /** Free-text headcount band, e.g. "11-50". Connectors disagree on format. */
  size: external_exports.string().optional(),
  description: external_exports.string().optional(),
  source: SourceSchema
});
var ContactSchema = external_exports.object({
  name: external_exports.string().min(1),
  leadDomain: external_exports.string().min(1),
  email: external_exports.string().email().optional(),
  title: external_exports.string().optional(),
  // A LinkedIn handle OR full URL — providers return both shapes, so don't reject
  // an otherwise-valid contact (and thus the whole run) over a non-URL handle.
  linkedin: external_exports.string().optional(),
  source: SourceSchema
});
var EnrichmentSchema = external_exports.object({
  /** What this enrichment is attached to. */
  subjectType: external_exports.enum(["lead", "contact"]),
  /** Natural key of the subject: a domain (lead) or an email (contact). */
  subjectKey: external_exports.string().min(1),
  provider: SourceSchema,
  /** Normalized highlights the scorer/draft seam reads. */
  funding: external_exports.object({
    lastRound: external_exports.string().optional(),
    totalRaisedUsd: external_exports.number().nonnegative().optional(),
    lastRoundDate: external_exports.string().optional(),
    investors: external_exports.array(external_exports.string()).optional()
  }).optional(),
  verifiedEmail: external_exports.string().email().optional(),
  phone: external_exports.string().optional(),
  /** Raw provider payload, retained for audit; never trusted as schema. */
  data: external_exports.record(external_exports.string(), external_exports.unknown()).default({}),
  fetchedAt: external_exports.string().datetime()
});
var MessageSchema = external_exports.object({
  /** FK to the Contact this message is for (email if known, else name@domain). */
  contactKey: external_exports.string().min(1),
  channel: external_exports.enum(["email", "linkedin"]),
  subject: external_exports.string().optional(),
  body: external_exports.string().min(1),
  cta: external_exports.string().min(1),
  /** 0-100 fit score the model assigned at the score() seam. */
  fitScore: external_exports.number().min(0).max(100).optional(),
  /** Provenance: which model + prompt version produced this. */
  model: external_exports.string().min(1),
  promptVersion: external_exports.string().min(1),
  createdAt: external_exports.string().datetime()
});
var RunStatusSchema = external_exports.enum(["researched", "enriched", "complete", "failed"]);
var CampaignRunSchema = external_exports.object({
  /** Caller-supplied or generated run id (no Date.now/random inside core). */
  id: external_exports.string().min(1),
  schemaVersion: external_exports.literal(SCHEMA_VERSION),
  icp: external_exports.string().min(1),
  domains: external_exports.array(external_exports.string().min(1)),
  /** Model + provider that ran the LLM seams. */
  provider: external_exports.string().min(1),
  model: external_exports.string().min(1),
  status: RunStatusSchema,
  leads: external_exports.array(LeadSchema).default([]),
  contacts: external_exports.array(ContactSchema).default([]),
  enrichments: external_exports.array(EnrichmentSchema).default([]),
  messages: external_exports.array(MessageSchema).default([]),
  /** Cumulative spend across LLM seams, if metered. */
  costUsd: external_exports.number().nonnegative().optional(),
  /** Names of connectors that were skipped (no key / unsupported) this run. */
  skippedConnectors: external_exports.array(external_exports.string()).default([]),
  createdAt: external_exports.string().datetime(),
  finishedAt: external_exports.string().datetime().optional()
});

// pipeline_core/validator.ts
var ValidationError = class extends Error {
  constructor(kind, issues) {
    super(
      `validation failed for ${kind}: ${issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`
    );
    this.kind = kind;
    this.issues = issues;
    this.name = "ValidationError";
  }
  kind;
  issues;
};
function gate(kind, schema, raw) {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return { ok: false, error: new ValidationError(kind, parsed.error.issues) };
}
function gateOrThrow(kind, schema, raw) {
  const r = gate(kind, schema, raw);
  if (!r.ok) throw r.error;
  return r.value;
}
var validateMessage = (raw) => gate("Message", MessageSchema, raw);
var validateCampaignRun = (raw) => gate("CampaignRun", CampaignRunSchema, raw);
var assertCampaignRun = (raw) => gateOrThrow("CampaignRun", CampaignRunSchema, raw);

// node_modules/@ai-sdk/ui-utils/dist/index.mjs
init_dist2();
init_dist2();

// node_modules/zod-to-json-schema/dist/esm/Options.js
var ignoreOverride = /* @__PURE__ */ Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref",
  openAiAnyTypeName: "OpenAiAnyType"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};

// node_modules/zod-to-json-schema/dist/esm/Refs.js
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    flags: { hasReferencedOpenAiAnyType: false },
    currentPath,
    propertyPath: void 0,
    seen: new Map(Object.entries(_options.definitions).map(([name17, def]) => [
      def._def,
      {
        def: def._def,
        path: [..._options.basePath, _options.definitionPath, name17],
        // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
        jsonSchema: void 0
      }
    ]))
  };
};

// node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
  if (!refs?.errorMessages)
    return;
  if (errorMessage) {
    res.errorMessage = {
      ...res.errorMessage,
      [key]: errorMessage
    };
  }
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
  res[key] = value;
  addErrorMessage(res, key, errorMessage, refs);
}

// node_modules/zod-to-json-schema/dist/esm/getRelativePath.js
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i])
      break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};

// node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef(refs) {
  if (refs.target !== "openAi") {
    return {};
  }
  const anyDefinitionPath = [
    ...refs.basePath,
    refs.definitionPath,
    refs.openAiAnyTypeName
  ];
  refs.flags.hasReferencedOpenAiAnyType = true;
  return {
    $ref: refs.$refStrategy === "relative" ? getRelativePath(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/")
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/array.js
function parseArrayDef(def, refs) {
  const res = {
    type: "array"
  };
  if (def.type?._def && def.type?._def?.typeName !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
  }
  if (def.maxLength) {
    setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
  }
  if (def.exactLength) {
    setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
    setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
  return {
    type: "boolean"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy ?? refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def, refs);
  }
}
var integerDateParser = (def, refs) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  if (refs.target === "openApi3") {
    return res;
  }
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        setResponseValueAndErrors(
          res,
          "minimum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
      case "max":
        setResponseValueAndErrors(
          res,
          "maximum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
    }
  }
  return res;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string")
    return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
      if (schema.unevaluatedProperties === void 0) {
        unevaluatedProperties = void 0;
      }
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      } else {
        unevaluatedProperties = void 0;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? {
    allOf: mergedAllOf,
    ...unevaluatedProperties
  } : void 0;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  if (refs.target === "openApi3") {
    return {
      type: parsedType === "bigint" ? "integer" : parsedType,
      enum: [def.value]
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/string.js
var emojiRegex2 = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex2 === void 0) {
      emojiRegex2 = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
    }
    return emojiRegex2;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          break;
        case "max":
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
          break;
        case "endsWith":
          addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
          break;
        case "datetime":
          addFormat(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat(res, "date", check.message, refs);
          break;
        case "time":
          addFormat(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check.message, refs);
          break;
        case "length":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "includes": {
          addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              setResponseValueAndErrors(res, "contentEncoding", "base64", check.message, refs);
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check.message, refs);
        }
        case "toLowerCase":
        case "toUpperCase":
        case "trim":
          break;
        default:
          /* @__PURE__ */ ((_) => {
          })(check);
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat(schema, value, message, refs) {
  if (schema.format || schema.anyOf?.some((x) => x.format)) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { format: schema.errorMessage.format }
        }
      });
      delete schema.format;
      if (schema.errorMessage) {
        delete schema.errorMessage.format;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "format", value, message, refs);
  }
}
function addPattern(schema, regex, message, refs) {
  if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { pattern: schema.errorMessage.pattern }
        }
      });
      delete schema.pattern;
      if (schema.errorMessage) {
        delete schema.errorMessage.pattern;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    m: regex.flags.includes("m"),
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch {
    console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
    return regex.source;
  }
  return pattern;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
  if (refs.target === "openAi") {
    console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  }
  if (refs.target === "openApi3" && def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce((acc, key) => ({
        ...acc,
        [key]: parseDef(def.valueType._def, {
          ...refs,
          currentPath: [...refs.currentPath, "properties", key]
        }) ?? parseAnyDef(refs)
      }), {}),
      additionalProperties: refs.rejectedAdditionalProperties
    };
  }
  const schema = {
    type: "object",
    additionalProperties: parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    }) ?? refs.allowedAdditionalProperties
  };
  if (refs.target === "openApi3") {
    return schema;
  }
  if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
    const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef(refs);
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef(refs);
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
  const object2 = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object2[object2[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object2[key]);
  const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef(refs) {
  return refs.target === "openAi" ? void 0 : {
    not: parseAnyDef({
      ...refs,
      currentPath: [...refs.currentPath, "not"]
    })
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
  return refs.target === "openApi3" ? {
    enum: ["null"],
    nullable: true
  } : {
    type: "null"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/union.js
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  if (refs.target === "openApi3")
    return asAnyOf(def, refs);
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce((acc, x) => {
      const type = typeof x._def.value;
      switch (type) {
        case "string":
        case "number":
        case "boolean":
          return [...acc, type];
        case "bigint":
          return [...acc, "integer"];
        case "object":
          if (x._def.value === null)
            return [...acc, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return acc;
      }
    }, []);
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce((acc, x) => {
          return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
        }, [])
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce((acc, x) => [
        ...acc,
        ...x._def.values.filter((x2) => !acc.includes(x2))
      ], [])
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", `${i}`]
  })).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
  return anyOf.length ? { anyOf } : void 0;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    if (refs.target === "openApi3") {
      return {
        type: primitiveMappings[def.innerType._def.typeName],
        nullable: true
      };
    }
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  if (refs.target === "openApi3") {
    const base2 = parseDef(def.innerType._def, {
      ...refs,
      currentPath: [...refs.currentPath]
    });
    if (base2 && "$ref" in base2)
      return { allOf: [base2], nullable: true };
    return base2 && { ...base2, nullable: true };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
  const res = {
    type: "number"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        addErrorMessage(res, "type", check.message, refs);
        break;
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/object.js
function parseObjectDef(def, refs) {
  const forceOptionalIntoNullable = refs.target === "openAi";
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    let propOptional = safeIsOptional(propDef);
    if (propOptional && forceOptionalIntoNullable) {
      if (propDef._def.typeName === "ZodOptional") {
        propDef = propDef._def.innerType;
      }
      if (!propDef.isNullable()) {
        propDef = propDef.nullable();
      }
      propOptional = false;
    }
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch {
    return true;
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
var parseOptionalDef = (def, refs) => {
  if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? {
    anyOf: [
      {
        not: parseAnyDef(refs)
      },
      innerSchema
    ]
  } : parseAnyDef(refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};

// node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
  }
  if (def.maxSize) {
    setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
    };
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef(refs) {
  return {
    not: parseAnyDef(refs)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef(refs) {
  return parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/selectParser.js
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return parseStringDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef(def, refs);
    case ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef();
    case ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef(refs);
    case ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef(refs);
    case ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef(def, refs);
    case ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef(def, refs);
    case ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef(def, refs);
    case ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef(def, refs);
    case ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef(def, refs);
    case ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNaN:
    case ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef(refs);
    case ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef(def, refs);
    case ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef(refs);
    case ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef(refs);
    case ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef(def, refs);
    case ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef(def, refs);
    case ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef(def, refs);
    case ZodFirstPartyTypeKind.ZodFunction:
    case ZodFirstPartyTypeKind.ZodVoid:
    case ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)(typeName);
  }
};

// node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema2 = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema2) {
    addMeta(def, refs, jsonSchema2);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema2, def, refs);
    newItem.jsonSchema = jsonSchema2;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema2;
  return jsonSchema2;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
        console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
        return parseAnyDef(refs);
      }
      return refs.$refStrategy === "seen" ? parseAnyDef(refs) : void 0;
    }
  }
};
var addMeta = (def, refs, jsonSchema2) => {
  if (def.description) {
    jsonSchema2.description = def.description;
    if (refs.markdownDescription) {
      jsonSchema2.markdownDescription = def.description;
    }
  }
  return jsonSchema2;
};

// node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
var zodToJsonSchema = (schema, options) => {
  const refs = getRefs(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name18, schema2]) => ({
    ...acc,
    [name18]: parseDef(schema2._def, {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name18]
    }, true) ?? parseAnyDef(refs)
  }), {}) : void 0;
  const name17 = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
  const main2 = parseDef(schema._def, name17 === void 0 ? refs : {
    ...refs,
    currentPath: [...refs.basePath, refs.definitionPath, name17]
  }, false) ?? parseAnyDef(refs);
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main2.title = title;
  }
  if (refs.flags.hasReferencedOpenAiAnyType) {
    if (!definitions) {
      definitions = {};
    }
    if (!definitions[refs.openAiAnyTypeName]) {
      definitions[refs.openAiAnyTypeName] = {
        // Skipping "object" as no properties can be defined and additionalProperties must be "false"
        type: ["string", "number", "integer", "boolean", "array", "null"],
        items: {
          $ref: refs.$refStrategy === "relative" ? "1" : [
            ...refs.basePath,
            refs.definitionPath,
            refs.openAiAnyTypeName
          ].join("/")
        }
      };
    }
  }
  const combined = name17 === void 0 ? definitions ? {
    ...main2,
    [refs.definitionPath]: definitions
  } : main2 : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name17
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name17]: main2
    }
  };
  if (refs.target === "jsonSchema7") {
    combined.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
    combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
  }
  if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
    console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
  }
  return combined;
};

// node_modules/zod-to-json-schema/dist/esm/index.js
var esm_default = zodToJsonSchema;

// node_modules/@ai-sdk/ui-utils/dist/index.mjs
var textStreamPart = {
  code: "0",
  name: "text",
  parse: (value) => {
    if (typeof value !== "string") {
      throw new Error('"text" parts expect a string value.');
    }
    return { type: "text", value };
  }
};
var errorStreamPart = {
  code: "3",
  name: "error",
  parse: (value) => {
    if (typeof value !== "string") {
      throw new Error('"error" parts expect a string value.');
    }
    return { type: "error", value };
  }
};
var assistantMessageStreamPart = {
  code: "4",
  name: "assistant_message",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("id" in value) || !("role" in value) || !("content" in value) || typeof value.id !== "string" || typeof value.role !== "string" || value.role !== "assistant" || !Array.isArray(value.content) || !value.content.every(
      (item) => item != null && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && item.text != null && typeof item.text === "object" && "value" in item.text && typeof item.text.value === "string"
    )) {
      throw new Error(
        '"assistant_message" parts expect an object with an "id", "role", and "content" property.'
      );
    }
    return {
      type: "assistant_message",
      value
    };
  }
};
var assistantControlDataStreamPart = {
  code: "5",
  name: "assistant_control_data",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("threadId" in value) || !("messageId" in value) || typeof value.threadId !== "string" || typeof value.messageId !== "string") {
      throw new Error(
        '"assistant_control_data" parts expect an object with a "threadId" and "messageId" property.'
      );
    }
    return {
      type: "assistant_control_data",
      value: {
        threadId: value.threadId,
        messageId: value.messageId
      }
    };
  }
};
var dataMessageStreamPart = {
  code: "6",
  name: "data_message",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("role" in value) || !("data" in value) || typeof value.role !== "string" || value.role !== "data") {
      throw new Error(
        '"data_message" parts expect an object with a "role" and "data" property.'
      );
    }
    return {
      type: "data_message",
      value
    };
  }
};
var assistantStreamParts = [
  textStreamPart,
  errorStreamPart,
  assistantMessageStreamPart,
  assistantControlDataStreamPart,
  dataMessageStreamPart
];
var assistantStreamPartsByCode = {
  [textStreamPart.code]: textStreamPart,
  [errorStreamPart.code]: errorStreamPart,
  [assistantMessageStreamPart.code]: assistantMessageStreamPart,
  [assistantControlDataStreamPart.code]: assistantControlDataStreamPart,
  [dataMessageStreamPart.code]: dataMessageStreamPart
};
var StreamStringPrefixes = {
  [textStreamPart.name]: textStreamPart.code,
  [errorStreamPart.name]: errorStreamPart.code,
  [assistantMessageStreamPart.name]: assistantMessageStreamPart.code,
  [assistantControlDataStreamPart.name]: assistantControlDataStreamPart.code,
  [dataMessageStreamPart.name]: dataMessageStreamPart.code
};
var validCodes = assistantStreamParts.map((part) => part.code);
function fixJson(input) {
  const stack = ["ROOT"];
  let lastValidIndex = -1;
  let literalStart = null;
  function processValueStart(char, i, swapState) {
    {
      switch (char) {
        case '"': {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_STRING");
          break;
        }
        case "f":
        case "t":
        case "n": {
          lastValidIndex = i;
          literalStart = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_LITERAL");
          break;
        }
        case "-": {
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_NUMBER");
          break;
        }
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_NUMBER");
          break;
        }
        case "{": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_OBJECT_START");
          break;
        }
        case "[": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_ARRAY_START");
          break;
        }
      }
    }
  }
  function processAfterObjectValue(char, i) {
    switch (char) {
      case ",": {
        stack.pop();
        stack.push("INSIDE_OBJECT_AFTER_COMMA");
        break;
      }
      case "}": {
        lastValidIndex = i;
        stack.pop();
        break;
      }
    }
  }
  function processAfterArrayValue(char, i) {
    switch (char) {
      case ",": {
        stack.pop();
        stack.push("INSIDE_ARRAY_AFTER_COMMA");
        break;
      }
      case "]": {
        lastValidIndex = i;
        stack.pop();
        break;
      }
    }
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const currentState = stack[stack.length - 1];
    switch (currentState) {
      case "ROOT":
        processValueStart(char, i, "FINISH");
        break;
      case "INSIDE_OBJECT_START": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_KEY");
            break;
          }
          case "}": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_AFTER_COMMA": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_KEY");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_KEY": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_AFTER_KEY");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_AFTER_KEY": {
        switch (char) {
          case ":": {
            stack.pop();
            stack.push("INSIDE_OBJECT_BEFORE_VALUE");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_BEFORE_VALUE": {
        processValueStart(char, i, "INSIDE_OBJECT_AFTER_VALUE");
        break;
      }
      case "INSIDE_OBJECT_AFTER_VALUE": {
        processAfterObjectValue(char, i);
        break;
      }
      case "INSIDE_STRING": {
        switch (char) {
          case '"': {
            stack.pop();
            lastValidIndex = i;
            break;
          }
          case "\\": {
            stack.push("INSIDE_STRING_ESCAPE");
            break;
          }
          default: {
            lastValidIndex = i;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_START": {
        switch (char) {
          case "]": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
          default: {
            lastValidIndex = i;
            processValueStart(char, i, "INSIDE_ARRAY_AFTER_VALUE");
            break;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_AFTER_VALUE": {
        switch (char) {
          case ",": {
            stack.pop();
            stack.push("INSIDE_ARRAY_AFTER_COMMA");
            break;
          }
          case "]": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
          default: {
            lastValidIndex = i;
            break;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_AFTER_COMMA": {
        processValueStart(char, i, "INSIDE_ARRAY_AFTER_VALUE");
        break;
      }
      case "INSIDE_STRING_ESCAPE": {
        stack.pop();
        lastValidIndex = i;
        break;
      }
      case "INSIDE_NUMBER": {
        switch (char) {
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9": {
            lastValidIndex = i;
            break;
          }
          case "e":
          case "E":
          case "-":
          case ".": {
            break;
          }
          case ",": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
              processAfterArrayValue(char, i);
            }
            if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
              processAfterObjectValue(char, i);
            }
            break;
          }
          case "}": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
              processAfterObjectValue(char, i);
            }
            break;
          }
          case "]": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
              processAfterArrayValue(char, i);
            }
            break;
          }
          default: {
            stack.pop();
            break;
          }
        }
        break;
      }
      case "INSIDE_LITERAL": {
        const partialLiteral = input.substring(literalStart, i + 1);
        if (!"false".startsWith(partialLiteral) && !"true".startsWith(partialLiteral) && !"null".startsWith(partialLiteral)) {
          stack.pop();
          if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
            processAfterObjectValue(char, i);
          } else if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
            processAfterArrayValue(char, i);
          }
        } else {
          lastValidIndex = i;
        }
        break;
      }
    }
  }
  let result = input.slice(0, lastValidIndex + 1);
  for (let i = stack.length - 1; i >= 0; i--) {
    const state = stack[i];
    switch (state) {
      case "INSIDE_STRING": {
        result += '"';
        break;
      }
      case "INSIDE_OBJECT_KEY":
      case "INSIDE_OBJECT_AFTER_KEY":
      case "INSIDE_OBJECT_AFTER_COMMA":
      case "INSIDE_OBJECT_START":
      case "INSIDE_OBJECT_BEFORE_VALUE":
      case "INSIDE_OBJECT_AFTER_VALUE": {
        result += "}";
        break;
      }
      case "INSIDE_ARRAY_START":
      case "INSIDE_ARRAY_AFTER_COMMA":
      case "INSIDE_ARRAY_AFTER_VALUE": {
        result += "]";
        break;
      }
      case "INSIDE_LITERAL": {
        const partialLiteral = input.substring(literalStart, input.length);
        if ("true".startsWith(partialLiteral)) {
          result += "true".slice(partialLiteral.length);
        } else if ("false".startsWith(partialLiteral)) {
          result += "false".slice(partialLiteral.length);
        } else if ("null".startsWith(partialLiteral)) {
          result += "null".slice(partialLiteral.length);
        }
      }
    }
  }
  return result;
}
function parsePartialJson(jsonText) {
  if (jsonText === void 0) {
    return { value: void 0, state: "undefined-input" };
  }
  let result = safeParseJSON({ text: jsonText });
  if (result.success) {
    return { value: result.value, state: "successful-parse" };
  }
  result = safeParseJSON({ text: fixJson(jsonText) });
  if (result.success) {
    return { value: result.value, state: "repaired-parse" };
  }
  return { value: void 0, state: "failed-parse" };
}
var textStreamPart2 = {
  code: "0",
  name: "text",
  parse: (value) => {
    if (typeof value !== "string") {
      throw new Error('"text" parts expect a string value.');
    }
    return { type: "text", value };
  }
};
var dataStreamPart = {
  code: "2",
  name: "data",
  parse: (value) => {
    if (!Array.isArray(value)) {
      throw new Error('"data" parts expect an array value.');
    }
    return { type: "data", value };
  }
};
var errorStreamPart2 = {
  code: "3",
  name: "error",
  parse: (value) => {
    if (typeof value !== "string") {
      throw new Error('"error" parts expect a string value.');
    }
    return { type: "error", value };
  }
};
var messageAnnotationsStreamPart = {
  code: "8",
  name: "message_annotations",
  parse: (value) => {
    if (!Array.isArray(value)) {
      throw new Error('"message_annotations" parts expect an array value.');
    }
    return { type: "message_annotations", value };
  }
};
var toolCallStreamPart = {
  code: "9",
  name: "tool_call",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("toolCallId" in value) || typeof value.toolCallId !== "string" || !("toolName" in value) || typeof value.toolName !== "string" || !("args" in value) || typeof value.args !== "object") {
      throw new Error(
        '"tool_call" parts expect an object with a "toolCallId", "toolName", and "args" property.'
      );
    }
    return {
      type: "tool_call",
      value
    };
  }
};
var toolResultStreamPart = {
  code: "a",
  name: "tool_result",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("toolCallId" in value) || typeof value.toolCallId !== "string" || !("result" in value)) {
      throw new Error(
        '"tool_result" parts expect an object with a "toolCallId" and a "result" property.'
      );
    }
    return {
      type: "tool_result",
      value
    };
  }
};
var toolCallStreamingStartStreamPart = {
  code: "b",
  name: "tool_call_streaming_start",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("toolCallId" in value) || typeof value.toolCallId !== "string" || !("toolName" in value) || typeof value.toolName !== "string") {
      throw new Error(
        '"tool_call_streaming_start" parts expect an object with a "toolCallId" and "toolName" property.'
      );
    }
    return {
      type: "tool_call_streaming_start",
      value
    };
  }
};
var toolCallDeltaStreamPart = {
  code: "c",
  name: "tool_call_delta",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("toolCallId" in value) || typeof value.toolCallId !== "string" || !("argsTextDelta" in value) || typeof value.argsTextDelta !== "string") {
      throw new Error(
        '"tool_call_delta" parts expect an object with a "toolCallId" and "argsTextDelta" property.'
      );
    }
    return {
      type: "tool_call_delta",
      value
    };
  }
};
var finishMessageStreamPart = {
  code: "d",
  name: "finish_message",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("finishReason" in value) || typeof value.finishReason !== "string") {
      throw new Error(
        '"finish_message" parts expect an object with a "finishReason" property.'
      );
    }
    const result = {
      finishReason: value.finishReason
    };
    if ("usage" in value && value.usage != null && typeof value.usage === "object" && "promptTokens" in value.usage && "completionTokens" in value.usage) {
      result.usage = {
        promptTokens: typeof value.usage.promptTokens === "number" ? value.usage.promptTokens : Number.NaN,
        completionTokens: typeof value.usage.completionTokens === "number" ? value.usage.completionTokens : Number.NaN
      };
    }
    return {
      type: "finish_message",
      value: result
    };
  }
};
var finishStepStreamPart = {
  code: "e",
  name: "finish_step",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("finishReason" in value) || typeof value.finishReason !== "string") {
      throw new Error(
        '"finish_step" parts expect an object with a "finishReason" property.'
      );
    }
    const result = {
      finishReason: value.finishReason,
      isContinued: false
    };
    if ("usage" in value && value.usage != null && typeof value.usage === "object" && "promptTokens" in value.usage && "completionTokens" in value.usage) {
      result.usage = {
        promptTokens: typeof value.usage.promptTokens === "number" ? value.usage.promptTokens : Number.NaN,
        completionTokens: typeof value.usage.completionTokens === "number" ? value.usage.completionTokens : Number.NaN
      };
    }
    if ("isContinued" in value && typeof value.isContinued === "boolean") {
      result.isContinued = value.isContinued;
    }
    return {
      type: "finish_step",
      value: result
    };
  }
};
var startStepStreamPart = {
  code: "f",
  name: "start_step",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("messageId" in value) || typeof value.messageId !== "string") {
      throw new Error(
        '"start_step" parts expect an object with an "id" property.'
      );
    }
    return {
      type: "start_step",
      value: {
        messageId: value.messageId
      }
    };
  }
};
var reasoningStreamPart = {
  code: "g",
  name: "reasoning",
  parse: (value) => {
    if (typeof value !== "string") {
      throw new Error('"reasoning" parts expect a string value.');
    }
    return { type: "reasoning", value };
  }
};
var sourcePart = {
  code: "h",
  name: "source",
  parse: (value) => {
    if (value == null || typeof value !== "object") {
      throw new Error('"source" parts expect a Source object.');
    }
    return {
      type: "source",
      value
    };
  }
};
var redactedReasoningStreamPart = {
  code: "i",
  name: "redacted_reasoning",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("data" in value) || typeof value.data !== "string") {
      throw new Error(
        '"redacted_reasoning" parts expect an object with a "data" property.'
      );
    }
    return { type: "redacted_reasoning", value: { data: value.data } };
  }
};
var reasoningSignatureStreamPart = {
  code: "j",
  name: "reasoning_signature",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("signature" in value) || typeof value.signature !== "string") {
      throw new Error(
        '"reasoning_signature" parts expect an object with a "signature" property.'
      );
    }
    return {
      type: "reasoning_signature",
      value: { signature: value.signature }
    };
  }
};
var fileStreamPart = {
  code: "k",
  name: "file",
  parse: (value) => {
    if (value == null || typeof value !== "object" || !("data" in value) || typeof value.data !== "string" || !("mimeType" in value) || typeof value.mimeType !== "string") {
      throw new Error(
        '"file" parts expect an object with a "data" and "mimeType" property.'
      );
    }
    return { type: "file", value };
  }
};
var dataStreamParts = [
  textStreamPart2,
  dataStreamPart,
  errorStreamPart2,
  messageAnnotationsStreamPart,
  toolCallStreamPart,
  toolResultStreamPart,
  toolCallStreamingStartStreamPart,
  toolCallDeltaStreamPart,
  finishMessageStreamPart,
  finishStepStreamPart,
  startStepStreamPart,
  reasoningStreamPart,
  sourcePart,
  redactedReasoningStreamPart,
  reasoningSignatureStreamPart,
  fileStreamPart
];
var dataStreamPartsByCode = Object.fromEntries(
  dataStreamParts.map((part) => [part.code, part])
);
var DataStreamStringPrefixes = Object.fromEntries(
  dataStreamParts.map((part) => [part.name, part.code])
);
var validCodes2 = dataStreamParts.map((part) => part.code);
function formatDataStreamPart(type, value) {
  const streamPart = dataStreamParts.find((part) => part.name === type);
  if (!streamPart) {
    throw new Error(`Invalid stream part type: ${type}`);
  }
  return `${streamPart.code}:${JSON.stringify(value)}
`;
}
var NEWLINE = "\n".charCodeAt(0);
var NEWLINE2 = "\n".charCodeAt(0);
function zodSchema(zodSchema2, options) {
  var _a17;
  const useReferences = (_a17 = options == null ? void 0 : options.useReferences) != null ? _a17 : false;
  return jsonSchema(
    esm_default(zodSchema2, {
      $refStrategy: useReferences ? "root" : "none",
      target: "jsonSchema7"
      // note: openai mode breaks various gemini conversions
    }),
    {
      validate: (value) => {
        const result = zodSchema2.safeParse(value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      }
    }
  );
}
var schemaSymbol = /* @__PURE__ */ Symbol.for("vercel.ai.schema");
function jsonSchema(jsonSchema2, {
  validate
} = {}) {
  return {
    [schemaSymbol]: true,
    _type: void 0,
    // should never be used directly
    [validatorSymbol]: true,
    jsonSchema: jsonSchema2,
    validate
  };
}
function isSchema(value) {
  return typeof value === "object" && value !== null && schemaSymbol in value && value[schemaSymbol] === true && "jsonSchema" in value && "validate" in value;
}
function asSchema(schema) {
  return isSchema(schema) ? schema : zodSchema(schema);
}

// node_modules/ai/dist/index.mjs
init_dist();
init_dist();
init_dist();
init_dist2();
init_dist();

// node_modules/@opentelemetry/api/build/esm/platform/node/globalThis.js
var _globalThis = typeof globalThis === "object" ? globalThis : global;

// node_modules/@opentelemetry/api/build/esm/version.js
var VERSION = "1.9.0";

// node_modules/@opentelemetry/api/build/esm/internal/semver.js
var re = /^(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
function _makeCompatibilityCheck(ownVersion) {
  var acceptedVersions = /* @__PURE__ */ new Set([ownVersion]);
  var rejectedVersions = /* @__PURE__ */ new Set();
  var myVersionMatch = ownVersion.match(re);
  if (!myVersionMatch) {
    return function() {
      return false;
    };
  }
  var ownVersionParsed = {
    major: +myVersionMatch[1],
    minor: +myVersionMatch[2],
    patch: +myVersionMatch[3],
    prerelease: myVersionMatch[4]
  };
  if (ownVersionParsed.prerelease != null) {
    return function isExactmatch(globalVersion) {
      return globalVersion === ownVersion;
    };
  }
  function _reject(v) {
    rejectedVersions.add(v);
    return false;
  }
  function _accept(v) {
    acceptedVersions.add(v);
    return true;
  }
  return function isCompatible2(globalVersion) {
    if (acceptedVersions.has(globalVersion)) {
      return true;
    }
    if (rejectedVersions.has(globalVersion)) {
      return false;
    }
    var globalVersionMatch = globalVersion.match(re);
    if (!globalVersionMatch) {
      return _reject(globalVersion);
    }
    var globalVersionParsed = {
      major: +globalVersionMatch[1],
      minor: +globalVersionMatch[2],
      patch: +globalVersionMatch[3],
      prerelease: globalVersionMatch[4]
    };
    if (globalVersionParsed.prerelease != null) {
      return _reject(globalVersion);
    }
    if (ownVersionParsed.major !== globalVersionParsed.major) {
      return _reject(globalVersion);
    }
    if (ownVersionParsed.major === 0) {
      if (ownVersionParsed.minor === globalVersionParsed.minor && ownVersionParsed.patch <= globalVersionParsed.patch) {
        return _accept(globalVersion);
      }
      return _reject(globalVersion);
    }
    if (ownVersionParsed.minor <= globalVersionParsed.minor) {
      return _accept(globalVersion);
    }
    return _reject(globalVersion);
  };
}
var isCompatible = _makeCompatibilityCheck(VERSION);

// node_modules/@opentelemetry/api/build/esm/internal/global-utils.js
var major = VERSION.split(".")[0];
var GLOBAL_OPENTELEMETRY_API_KEY = /* @__PURE__ */ Symbol.for("opentelemetry.js.api." + major);
var _global = _globalThis;
function registerGlobal(type, instance, diag, allowOverride) {
  var _a17;
  if (allowOverride === void 0) {
    allowOverride = false;
  }
  var api = _global[GLOBAL_OPENTELEMETRY_API_KEY] = (_a17 = _global[GLOBAL_OPENTELEMETRY_API_KEY]) !== null && _a17 !== void 0 ? _a17 : {
    version: VERSION
  };
  if (!allowOverride && api[type]) {
    var err = new Error("@opentelemetry/api: Attempted duplicate registration of API: " + type);
    diag.error(err.stack || err.message);
    return false;
  }
  if (api.version !== VERSION) {
    var err = new Error("@opentelemetry/api: Registration of version v" + api.version + " for " + type + " does not match previously registered API v" + VERSION);
    diag.error(err.stack || err.message);
    return false;
  }
  api[type] = instance;
  diag.debug("@opentelemetry/api: Registered a global for " + type + " v" + VERSION + ".");
  return true;
}
function getGlobal(type) {
  var _a17, _b;
  var globalVersion = (_a17 = _global[GLOBAL_OPENTELEMETRY_API_KEY]) === null || _a17 === void 0 ? void 0 : _a17.version;
  if (!globalVersion || !isCompatible(globalVersion)) {
    return;
  }
  return (_b = _global[GLOBAL_OPENTELEMETRY_API_KEY]) === null || _b === void 0 ? void 0 : _b[type];
}
function unregisterGlobal(type, diag) {
  diag.debug("@opentelemetry/api: Unregistering a global for " + type + " v" + VERSION + ".");
  var api = _global[GLOBAL_OPENTELEMETRY_API_KEY];
  if (api) {
    delete api[type];
  }
}

// node_modules/@opentelemetry/api/build/esm/diag/ComponentLogger.js
var __read = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var DiagComponentLogger = (
  /** @class */
  (function() {
    function DiagComponentLogger2(props) {
      this._namespace = props.namespace || "DiagComponentLogger";
    }
    DiagComponentLogger2.prototype.debug = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("debug", this._namespace, args);
    };
    DiagComponentLogger2.prototype.error = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("error", this._namespace, args);
    };
    DiagComponentLogger2.prototype.info = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("info", this._namespace, args);
    };
    DiagComponentLogger2.prototype.warn = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("warn", this._namespace, args);
    };
    DiagComponentLogger2.prototype.verbose = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("verbose", this._namespace, args);
    };
    return DiagComponentLogger2;
  })()
);
function logProxy(funcName, namespace, args) {
  var logger = getGlobal("diag");
  if (!logger) {
    return;
  }
  args.unshift(namespace);
  return logger[funcName].apply(logger, __spreadArray([], __read(args), false));
}

// node_modules/@opentelemetry/api/build/esm/diag/types.js
var DiagLogLevel;
(function(DiagLogLevel2) {
  DiagLogLevel2[DiagLogLevel2["NONE"] = 0] = "NONE";
  DiagLogLevel2[DiagLogLevel2["ERROR"] = 30] = "ERROR";
  DiagLogLevel2[DiagLogLevel2["WARN"] = 50] = "WARN";
  DiagLogLevel2[DiagLogLevel2["INFO"] = 60] = "INFO";
  DiagLogLevel2[DiagLogLevel2["DEBUG"] = 70] = "DEBUG";
  DiagLogLevel2[DiagLogLevel2["VERBOSE"] = 80] = "VERBOSE";
  DiagLogLevel2[DiagLogLevel2["ALL"] = 9999] = "ALL";
})(DiagLogLevel || (DiagLogLevel = {}));

// node_modules/@opentelemetry/api/build/esm/diag/internal/logLevelLogger.js
function createLogLevelDiagLogger(maxLevel, logger) {
  if (maxLevel < DiagLogLevel.NONE) {
    maxLevel = DiagLogLevel.NONE;
  } else if (maxLevel > DiagLogLevel.ALL) {
    maxLevel = DiagLogLevel.ALL;
  }
  logger = logger || {};
  function _filterFunc(funcName, theLevel) {
    var theFunc = logger[funcName];
    if (typeof theFunc === "function" && maxLevel >= theLevel) {
      return theFunc.bind(logger);
    }
    return function() {
    };
  }
  return {
    error: _filterFunc("error", DiagLogLevel.ERROR),
    warn: _filterFunc("warn", DiagLogLevel.WARN),
    info: _filterFunc("info", DiagLogLevel.INFO),
    debug: _filterFunc("debug", DiagLogLevel.DEBUG),
    verbose: _filterFunc("verbose", DiagLogLevel.VERBOSE)
  };
}

// node_modules/@opentelemetry/api/build/esm/api/diag.js
var __read2 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray2 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var API_NAME = "diag";
var DiagAPI = (
  /** @class */
  (function() {
    function DiagAPI2() {
      function _logProxy(funcName) {
        return function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          var logger = getGlobal("diag");
          if (!logger)
            return;
          return logger[funcName].apply(logger, __spreadArray2([], __read2(args), false));
        };
      }
      var self = this;
      var setLogger = function(logger, optionsOrLogLevel) {
        var _a17, _b, _c;
        if (optionsOrLogLevel === void 0) {
          optionsOrLogLevel = { logLevel: DiagLogLevel.INFO };
        }
        if (logger === self) {
          var err = new Error("Cannot use diag as the logger for itself. Please use a DiagLogger implementation like ConsoleDiagLogger or a custom implementation");
          self.error((_a17 = err.stack) !== null && _a17 !== void 0 ? _a17 : err.message);
          return false;
        }
        if (typeof optionsOrLogLevel === "number") {
          optionsOrLogLevel = {
            logLevel: optionsOrLogLevel
          };
        }
        var oldLogger = getGlobal("diag");
        var newLogger = createLogLevelDiagLogger((_b = optionsOrLogLevel.logLevel) !== null && _b !== void 0 ? _b : DiagLogLevel.INFO, logger);
        if (oldLogger && !optionsOrLogLevel.suppressOverrideMessage) {
          var stack = (_c = new Error().stack) !== null && _c !== void 0 ? _c : "<failed to generate stacktrace>";
          oldLogger.warn("Current logger will be overwritten from " + stack);
          newLogger.warn("Current logger will overwrite one already registered from " + stack);
        }
        return registerGlobal("diag", newLogger, self, true);
      };
      self.setLogger = setLogger;
      self.disable = function() {
        unregisterGlobal(API_NAME, self);
      };
      self.createComponentLogger = function(options) {
        return new DiagComponentLogger(options);
      };
      self.verbose = _logProxy("verbose");
      self.debug = _logProxy("debug");
      self.info = _logProxy("info");
      self.warn = _logProxy("warn");
      self.error = _logProxy("error");
    }
    DiagAPI2.instance = function() {
      if (!this._instance) {
        this._instance = new DiagAPI2();
      }
      return this._instance;
    };
    return DiagAPI2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/context/context.js
function createContextKey(description) {
  return Symbol.for(description);
}
var BaseContext = (
  /** @class */
  /* @__PURE__ */ (function() {
    function BaseContext2(parentContext) {
      var self = this;
      self._currentContext = parentContext ? new Map(parentContext) : /* @__PURE__ */ new Map();
      self.getValue = function(key) {
        return self._currentContext.get(key);
      };
      self.setValue = function(key, value) {
        var context = new BaseContext2(self._currentContext);
        context._currentContext.set(key, value);
        return context;
      };
      self.deleteValue = function(key) {
        var context = new BaseContext2(self._currentContext);
        context._currentContext.delete(key);
        return context;
      };
    }
    return BaseContext2;
  })()
);
var ROOT_CONTEXT = new BaseContext();

// node_modules/@opentelemetry/api/build/esm/context/NoopContextManager.js
var __read3 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray3 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var NoopContextManager = (
  /** @class */
  (function() {
    function NoopContextManager2() {
    }
    NoopContextManager2.prototype.active = function() {
      return ROOT_CONTEXT;
    };
    NoopContextManager2.prototype.with = function(_context, fn, thisArg) {
      var args = [];
      for (var _i = 3; _i < arguments.length; _i++) {
        args[_i - 3] = arguments[_i];
      }
      return fn.call.apply(fn, __spreadArray3([thisArg], __read3(args), false));
    };
    NoopContextManager2.prototype.bind = function(_context, target) {
      return target;
    };
    NoopContextManager2.prototype.enable = function() {
      return this;
    };
    NoopContextManager2.prototype.disable = function() {
      return this;
    };
    return NoopContextManager2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/api/context.js
var __read4 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray4 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var API_NAME2 = "context";
var NOOP_CONTEXT_MANAGER = new NoopContextManager();
var ContextAPI = (
  /** @class */
  (function() {
    function ContextAPI2() {
    }
    ContextAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new ContextAPI2();
      }
      return this._instance;
    };
    ContextAPI2.prototype.setGlobalContextManager = function(contextManager) {
      return registerGlobal(API_NAME2, contextManager, DiagAPI.instance());
    };
    ContextAPI2.prototype.active = function() {
      return this._getContextManager().active();
    };
    ContextAPI2.prototype.with = function(context, fn, thisArg) {
      var _a17;
      var args = [];
      for (var _i = 3; _i < arguments.length; _i++) {
        args[_i - 3] = arguments[_i];
      }
      return (_a17 = this._getContextManager()).with.apply(_a17, __spreadArray4([context, fn, thisArg], __read4(args), false));
    };
    ContextAPI2.prototype.bind = function(context, target) {
      return this._getContextManager().bind(context, target);
    };
    ContextAPI2.prototype._getContextManager = function() {
      return getGlobal(API_NAME2) || NOOP_CONTEXT_MANAGER;
    };
    ContextAPI2.prototype.disable = function() {
      this._getContextManager().disable();
      unregisterGlobal(API_NAME2, DiagAPI.instance());
    };
    return ContextAPI2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace/trace_flags.js
var TraceFlags;
(function(TraceFlags2) {
  TraceFlags2[TraceFlags2["NONE"] = 0] = "NONE";
  TraceFlags2[TraceFlags2["SAMPLED"] = 1] = "SAMPLED";
})(TraceFlags || (TraceFlags = {}));

// node_modules/@opentelemetry/api/build/esm/trace/invalid-span-constants.js
var INVALID_SPANID = "0000000000000000";
var INVALID_TRACEID = "00000000000000000000000000000000";
var INVALID_SPAN_CONTEXT = {
  traceId: INVALID_TRACEID,
  spanId: INVALID_SPANID,
  traceFlags: TraceFlags.NONE
};

// node_modules/@opentelemetry/api/build/esm/trace/NonRecordingSpan.js
var NonRecordingSpan = (
  /** @class */
  (function() {
    function NonRecordingSpan2(_spanContext) {
      if (_spanContext === void 0) {
        _spanContext = INVALID_SPAN_CONTEXT;
      }
      this._spanContext = _spanContext;
    }
    NonRecordingSpan2.prototype.spanContext = function() {
      return this._spanContext;
    };
    NonRecordingSpan2.prototype.setAttribute = function(_key, _value) {
      return this;
    };
    NonRecordingSpan2.prototype.setAttributes = function(_attributes) {
      return this;
    };
    NonRecordingSpan2.prototype.addEvent = function(_name, _attributes) {
      return this;
    };
    NonRecordingSpan2.prototype.addLink = function(_link) {
      return this;
    };
    NonRecordingSpan2.prototype.addLinks = function(_links) {
      return this;
    };
    NonRecordingSpan2.prototype.setStatus = function(_status) {
      return this;
    };
    NonRecordingSpan2.prototype.updateName = function(_name) {
      return this;
    };
    NonRecordingSpan2.prototype.end = function(_endTime) {
    };
    NonRecordingSpan2.prototype.isRecording = function() {
      return false;
    };
    NonRecordingSpan2.prototype.recordException = function(_exception, _time) {
    };
    return NonRecordingSpan2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace/context-utils.js
var SPAN_KEY = createContextKey("OpenTelemetry Context Key SPAN");
function getSpan(context) {
  return context.getValue(SPAN_KEY) || void 0;
}
function getActiveSpan() {
  return getSpan(ContextAPI.getInstance().active());
}
function setSpan(context, span) {
  return context.setValue(SPAN_KEY, span);
}
function deleteSpan(context) {
  return context.deleteValue(SPAN_KEY);
}
function setSpanContext(context, spanContext) {
  return setSpan(context, new NonRecordingSpan(spanContext));
}
function getSpanContext(context) {
  var _a17;
  return (_a17 = getSpan(context)) === null || _a17 === void 0 ? void 0 : _a17.spanContext();
}

// node_modules/@opentelemetry/api/build/esm/trace/spancontext-utils.js
var VALID_TRACEID_REGEX = /^([0-9a-f]{32})$/i;
var VALID_SPANID_REGEX = /^[0-9a-f]{16}$/i;
function isValidTraceId(traceId) {
  return VALID_TRACEID_REGEX.test(traceId) && traceId !== INVALID_TRACEID;
}
function isValidSpanId(spanId) {
  return VALID_SPANID_REGEX.test(spanId) && spanId !== INVALID_SPANID;
}
function isSpanContextValid(spanContext) {
  return isValidTraceId(spanContext.traceId) && isValidSpanId(spanContext.spanId);
}
function wrapSpanContext(spanContext) {
  return new NonRecordingSpan(spanContext);
}

// node_modules/@opentelemetry/api/build/esm/trace/NoopTracer.js
var contextApi = ContextAPI.getInstance();
var NoopTracer = (
  /** @class */
  (function() {
    function NoopTracer2() {
    }
    NoopTracer2.prototype.startSpan = function(name17, options, context) {
      if (context === void 0) {
        context = contextApi.active();
      }
      var root = Boolean(options === null || options === void 0 ? void 0 : options.root);
      if (root) {
        return new NonRecordingSpan();
      }
      var parentFromContext = context && getSpanContext(context);
      if (isSpanContext(parentFromContext) && isSpanContextValid(parentFromContext)) {
        return new NonRecordingSpan(parentFromContext);
      } else {
        return new NonRecordingSpan();
      }
    };
    NoopTracer2.prototype.startActiveSpan = function(name17, arg2, arg3, arg4) {
      var opts;
      var ctx;
      var fn;
      if (arguments.length < 2) {
        return;
      } else if (arguments.length === 2) {
        fn = arg2;
      } else if (arguments.length === 3) {
        opts = arg2;
        fn = arg3;
      } else {
        opts = arg2;
        ctx = arg3;
        fn = arg4;
      }
      var parentContext = ctx !== null && ctx !== void 0 ? ctx : contextApi.active();
      var span = this.startSpan(name17, opts, parentContext);
      var contextWithSpanSet = setSpan(parentContext, span);
      return contextApi.with(contextWithSpanSet, fn, void 0, span);
    };
    return NoopTracer2;
  })()
);
function isSpanContext(spanContext) {
  return typeof spanContext === "object" && typeof spanContext["spanId"] === "string" && typeof spanContext["traceId"] === "string" && typeof spanContext["traceFlags"] === "number";
}

// node_modules/@opentelemetry/api/build/esm/trace/ProxyTracer.js
var NOOP_TRACER = new NoopTracer();
var ProxyTracer = (
  /** @class */
  (function() {
    function ProxyTracer2(_provider, name17, version, options) {
      this._provider = _provider;
      this.name = name17;
      this.version = version;
      this.options = options;
    }
    ProxyTracer2.prototype.startSpan = function(name17, options, context) {
      return this._getTracer().startSpan(name17, options, context);
    };
    ProxyTracer2.prototype.startActiveSpan = function(_name, _options, _context, _fn) {
      var tracer = this._getTracer();
      return Reflect.apply(tracer.startActiveSpan, tracer, arguments);
    };
    ProxyTracer2.prototype._getTracer = function() {
      if (this._delegate) {
        return this._delegate;
      }
      var tracer = this._provider.getDelegateTracer(this.name, this.version, this.options);
      if (!tracer) {
        return NOOP_TRACER;
      }
      this._delegate = tracer;
      return this._delegate;
    };
    return ProxyTracer2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace/NoopTracerProvider.js
var NoopTracerProvider = (
  /** @class */
  (function() {
    function NoopTracerProvider2() {
    }
    NoopTracerProvider2.prototype.getTracer = function(_name, _version, _options) {
      return new NoopTracer();
    };
    return NoopTracerProvider2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace/ProxyTracerProvider.js
var NOOP_TRACER_PROVIDER = new NoopTracerProvider();
var ProxyTracerProvider = (
  /** @class */
  (function() {
    function ProxyTracerProvider2() {
    }
    ProxyTracerProvider2.prototype.getTracer = function(name17, version, options) {
      var _a17;
      return (_a17 = this.getDelegateTracer(name17, version, options)) !== null && _a17 !== void 0 ? _a17 : new ProxyTracer(this, name17, version, options);
    };
    ProxyTracerProvider2.prototype.getDelegate = function() {
      var _a17;
      return (_a17 = this._delegate) !== null && _a17 !== void 0 ? _a17 : NOOP_TRACER_PROVIDER;
    };
    ProxyTracerProvider2.prototype.setDelegate = function(delegate) {
      this._delegate = delegate;
    };
    ProxyTracerProvider2.prototype.getDelegateTracer = function(name17, version, options) {
      var _a17;
      return (_a17 = this._delegate) === null || _a17 === void 0 ? void 0 : _a17.getTracer(name17, version, options);
    };
    return ProxyTracerProvider2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace/status.js
var SpanStatusCode;
(function(SpanStatusCode2) {
  SpanStatusCode2[SpanStatusCode2["UNSET"] = 0] = "UNSET";
  SpanStatusCode2[SpanStatusCode2["OK"] = 1] = "OK";
  SpanStatusCode2[SpanStatusCode2["ERROR"] = 2] = "ERROR";
})(SpanStatusCode || (SpanStatusCode = {}));

// node_modules/@opentelemetry/api/build/esm/api/trace.js
var API_NAME3 = "trace";
var TraceAPI = (
  /** @class */
  (function() {
    function TraceAPI2() {
      this._proxyTracerProvider = new ProxyTracerProvider();
      this.wrapSpanContext = wrapSpanContext;
      this.isSpanContextValid = isSpanContextValid;
      this.deleteSpan = deleteSpan;
      this.getSpan = getSpan;
      this.getActiveSpan = getActiveSpan;
      this.getSpanContext = getSpanContext;
      this.setSpan = setSpan;
      this.setSpanContext = setSpanContext;
    }
    TraceAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new TraceAPI2();
      }
      return this._instance;
    };
    TraceAPI2.prototype.setGlobalTracerProvider = function(provider) {
      var success = registerGlobal(API_NAME3, this._proxyTracerProvider, DiagAPI.instance());
      if (success) {
        this._proxyTracerProvider.setDelegate(provider);
      }
      return success;
    };
    TraceAPI2.prototype.getTracerProvider = function() {
      return getGlobal(API_NAME3) || this._proxyTracerProvider;
    };
    TraceAPI2.prototype.getTracer = function(name17, version) {
      return this.getTracerProvider().getTracer(name17, version);
    };
    TraceAPI2.prototype.disable = function() {
      unregisterGlobal(API_NAME3, DiagAPI.instance());
      this._proxyTracerProvider = new ProxyTracerProvider();
    };
    return TraceAPI2;
  })()
);

// node_modules/@opentelemetry/api/build/esm/trace-api.js
var trace = TraceAPI.getInstance();

// node_modules/ai/dist/index.mjs
init_dist2();
init_dist();
init_dist2();
init_dist();
init_dist();
init_dist2();
init_dist();
init_zod();
init_dist();
init_dist();
init_dist2();
init_zod();
init_dist();
init_zod();
init_zod();
init_zod();
init_zod();
init_zod();
init_dist();
init_dist2();
init_dist2();
init_dist2();
init_dist2();
init_dist2();
init_zod();
init_zod();
init_dist2();
var __defProp2 = Object.defineProperty;
var __export2 = (target, all) => {
  for (var name17 in all)
    __defProp2(target, name17, { get: all[name17], enumerable: true });
};
function prepareResponseHeaders(headers9, {
  contentType,
  dataStreamVersion
}) {
  const responseHeaders = new Headers(headers9 != null ? headers9 : {});
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", contentType);
  }
  if (dataStreamVersion !== void 0) {
    responseHeaders.set("X-Vercel-AI-Data-Stream", dataStreamVersion);
  }
  return responseHeaders;
}
var UnsupportedModelVersionError = class extends AISDKError {
  constructor() {
    super({
      name: "AI_UnsupportedModelVersionError",
      message: `Unsupported model version. AI SDK 4 only supports models that implement specification version "v1". Please upgrade to AI SDK 5 to use this model.`
    });
  }
};
var name14 = "AI_InvalidArgumentError";
var marker15 = `vercel.ai.error.${name14}`;
var symbol15 = Symbol.for(marker15);
var _a15;
var InvalidArgumentError2 = class extends AISDKError {
  constructor({
    parameter,
    value,
    message
  }) {
    super({
      name: name14,
      message: `Invalid argument for parameter ${parameter}: ${message}`
    });
    this[_a15] = true;
    this.parameter = parameter;
    this.value = value;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker15);
  }
};
_a15 = symbol15;
var name22 = "AI_RetryError";
var marker22 = `vercel.ai.error.${name22}`;
var symbol22 = Symbol.for(marker22);
var _a22;
var RetryError = class extends AISDKError {
  constructor({
    message,
    reason,
    errors
  }) {
    super({ name: name22, message });
    this[_a22] = true;
    this.reason = reason;
    this.errors = errors;
    this.lastError = errors[errors.length - 1];
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker22);
  }
};
_a22 = symbol22;
var retryWithExponentialBackoff = ({
  maxRetries = 2,
  initialDelayInMs = 2e3,
  backoffFactor = 2
} = {}) => async (f) => _retryWithExponentialBackoff(f, {
  maxRetries,
  delayInMs: initialDelayInMs,
  backoffFactor
});
async function _retryWithExponentialBackoff(f, {
  maxRetries,
  delayInMs,
  backoffFactor
}, errors = []) {
  try {
    return await f();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (maxRetries === 0) {
      throw error;
    }
    const errorMessage = getErrorMessage2(error);
    const newErrors = [...errors, error];
    const tryNumber = newErrors.length;
    if (tryNumber > maxRetries) {
      throw new RetryError({
        message: `Failed after ${tryNumber} attempts. Last error: ${errorMessage}`,
        reason: "maxRetriesExceeded",
        errors: newErrors
      });
    }
    if (error instanceof Error && APICallError.isInstance(error) && error.isRetryable === true && tryNumber <= maxRetries) {
      await delay(delayInMs);
      return _retryWithExponentialBackoff(
        f,
        { maxRetries, delayInMs: backoffFactor * delayInMs, backoffFactor },
        newErrors
      );
    }
    if (tryNumber === 1) {
      throw error;
    }
    throw new RetryError({
      message: `Failed after ${tryNumber} attempts with non-retryable error: '${errorMessage}'`,
      reason: "errorNotRetryable",
      errors: newErrors
    });
  }
}
function prepareRetries({
  maxRetries
}) {
  if (maxRetries != null) {
    if (!Number.isInteger(maxRetries)) {
      throw new InvalidArgumentError2({
        parameter: "maxRetries",
        value: maxRetries,
        message: "maxRetries must be an integer"
      });
    }
    if (maxRetries < 0) {
      throw new InvalidArgumentError2({
        parameter: "maxRetries",
        value: maxRetries,
        message: "maxRetries must be >= 0"
      });
    }
  }
  const maxRetriesResult = maxRetries != null ? maxRetries : 2;
  return {
    maxRetries: maxRetriesResult,
    retry: retryWithExponentialBackoff({ maxRetries: maxRetriesResult })
  };
}
function assembleOperationName({
  operationId,
  telemetry
}) {
  return {
    // standardized operation and resource name:
    "operation.name": `${operationId}${(telemetry == null ? void 0 : telemetry.functionId) != null ? ` ${telemetry.functionId}` : ""}`,
    "resource.name": telemetry == null ? void 0 : telemetry.functionId,
    // detailed, AI SDK specific data:
    "ai.operationId": operationId,
    "ai.telemetry.functionId": telemetry == null ? void 0 : telemetry.functionId
  };
}
function getBaseTelemetryAttributes({
  model,
  settings,
  telemetry,
  headers: headers9
}) {
  var _a17;
  return {
    "ai.model.provider": model.provider,
    "ai.model.id": model.modelId,
    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      attributes[`ai.settings.${key}`] = value;
      return attributes;
    }, {}),
    // add metadata as attributes:
    ...Object.entries((_a17 = telemetry == null ? void 0 : telemetry.metadata) != null ? _a17 : {}).reduce(
      (attributes, [key, value]) => {
        attributes[`ai.telemetry.metadata.${key}`] = value;
        return attributes;
      },
      {}
    ),
    // request headers
    ...Object.entries(headers9 != null ? headers9 : {}).reduce((attributes, [key, value]) => {
      if (value !== void 0) {
        attributes[`ai.request.headers.${key}`] = value;
      }
      return attributes;
    }, {})
  };
}
var noopTracer = {
  startSpan() {
    return noopSpan;
  },
  startActiveSpan(name17, arg1, arg2, arg3) {
    if (typeof arg1 === "function") {
      return arg1(noopSpan);
    }
    if (typeof arg2 === "function") {
      return arg2(noopSpan);
    }
    if (typeof arg3 === "function") {
      return arg3(noopSpan);
    }
  }
};
var noopSpan = {
  spanContext() {
    return noopSpanContext;
  },
  setAttribute() {
    return this;
  },
  setAttributes() {
    return this;
  },
  addEvent() {
    return this;
  },
  addLink() {
    return this;
  },
  addLinks() {
    return this;
  },
  setStatus() {
    return this;
  },
  updateName() {
    return this;
  },
  end() {
    return this;
  },
  isRecording() {
    return false;
  },
  recordException() {
    return this;
  }
};
var noopSpanContext = {
  traceId: "",
  spanId: "",
  traceFlags: 0
};
function getTracer({
  isEnabled = false,
  tracer
} = {}) {
  if (!isEnabled) {
    return noopTracer;
  }
  if (tracer) {
    return tracer;
  }
  return trace.getTracer("ai");
}
function recordSpan({
  name: name17,
  tracer,
  attributes,
  fn,
  endWhenDone = true
}) {
  return tracer.startActiveSpan(name17, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      if (endWhenDone) {
        span.end();
      }
      return result;
    } catch (error) {
      try {
        recordErrorOnSpan(span, error);
      } finally {
        span.end();
      }
      throw error;
    }
  });
}
function recordErrorOnSpan(span, error) {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}
function selectTelemetryAttributes({
  telemetry,
  attributes
}) {
  if ((telemetry == null ? void 0 : telemetry.isEnabled) !== true) {
    return {};
  }
  return Object.entries(attributes).reduce((attributes2, [key, value]) => {
    if (value === void 0) {
      return attributes2;
    }
    if (typeof value === "object" && "input" in value && typeof value.input === "function") {
      if ((telemetry == null ? void 0 : telemetry.recordInputs) === false) {
        return attributes2;
      }
      const result = value.input();
      return result === void 0 ? attributes2 : { ...attributes2, [key]: result };
    }
    if (typeof value === "object" && "output" in value && typeof value.output === "function") {
      if ((telemetry == null ? void 0 : telemetry.recordOutputs) === false) {
        return attributes2;
      }
      const result = value.output();
      return result === void 0 ? attributes2 : { ...attributes2, [key]: result };
    }
    return { ...attributes2, [key]: value };
  }, {});
}
var name32 = "AI_NoImageGeneratedError";
var marker32 = `vercel.ai.error.${name32}`;
var symbol32 = Symbol.for(marker32);
var _a32;
_a32 = symbol32;
var imageMimeTypeSignatures = [
  {
    mimeType: "image/gif",
    bytesPrefix: [71, 73, 70],
    base64Prefix: "R0lG"
  },
  {
    mimeType: "image/png",
    bytesPrefix: [137, 80, 78, 71],
    base64Prefix: "iVBORw"
  },
  {
    mimeType: "image/jpeg",
    bytesPrefix: [255, 216],
    base64Prefix: "/9j/"
  },
  {
    mimeType: "image/webp",
    bytesPrefix: [82, 73, 70, 70],
    base64Prefix: "UklGRg"
  },
  {
    mimeType: "image/bmp",
    bytesPrefix: [66, 77],
    base64Prefix: "Qk"
  },
  {
    mimeType: "image/tiff",
    bytesPrefix: [73, 73, 42, 0],
    base64Prefix: "SUkqAA"
  },
  {
    mimeType: "image/tiff",
    bytesPrefix: [77, 77, 0, 42],
    base64Prefix: "TU0AKg"
  },
  {
    mimeType: "image/avif",
    bytesPrefix: [
      0,
      0,
      0,
      32,
      102,
      116,
      121,
      112,
      97,
      118,
      105,
      102
    ],
    base64Prefix: "AAAAIGZ0eXBhdmlm"
  },
  {
    mimeType: "image/heic",
    bytesPrefix: [
      0,
      0,
      0,
      32,
      102,
      116,
      121,
      112,
      104,
      101,
      105,
      99
    ],
    base64Prefix: "AAAAIGZ0eXBoZWlj"
  }
];
var stripID3 = (data) => {
  const bytes = typeof data === "string" ? convertBase64ToUint8Array(data) : data;
  const id3Size = (bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127;
  return bytes.slice(id3Size + 10);
};
function stripID3TagsIfPresent(data) {
  const hasId3 = typeof data === "string" && data.startsWith("SUQz") || typeof data !== "string" && data.length > 10 && data[0] === 73 && // 'I'
  data[1] === 68 && // 'D'
  data[2] === 51;
  return hasId3 ? stripID3(data) : data;
}
function detectMimeType({
  data,
  signatures
}) {
  const processedData = stripID3TagsIfPresent(data);
  for (const signature of signatures) {
    if (typeof processedData === "string" ? processedData.startsWith(signature.base64Prefix) : processedData.length >= signature.bytesPrefix.length && signature.bytesPrefix.every(
      (byte, index) => processedData[index] === byte
    )) {
      return signature.mimeType;
    }
  }
  return void 0;
}
var name42 = "AI_NoObjectGeneratedError";
var marker42 = `vercel.ai.error.${name42}`;
var symbol42 = Symbol.for(marker42);
var _a42;
var NoObjectGeneratedError = class extends AISDKError {
  constructor({
    message = "No object generated.",
    cause,
    text: text2,
    response,
    usage,
    finishReason
  }) {
    super({ name: name42, message, cause });
    this[_a42] = true;
    this.text = text2;
    this.response = response;
    this.usage = usage;
    this.finishReason = finishReason;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker42);
  }
};
_a42 = symbol42;
var name52 = "AI_DownloadError";
var marker52 = `vercel.ai.error.${name52}`;
var symbol52 = Symbol.for(marker52);
var _a52;
var DownloadError = class extends AISDKError {
  constructor({
    url,
    statusCode,
    statusText,
    cause,
    message = cause == null ? `Failed to download ${url}: ${statusCode} ${statusText}` : `Failed to download ${url}: ${cause}`
  }) {
    super({ name: name52, message, cause });
    this[_a52] = true;
    this.url = url;
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker52);
  }
};
_a52 = symbol52;
async function download({ url }) {
  var _a17;
  const urlText = url.toString();
  try {
    const response = await fetch(urlText);
    if (!response.ok) {
      throw new DownloadError({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText
      });
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      mimeType: (_a17 = response.headers.get("content-type")) != null ? _a17 : void 0
    };
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }
    throw new DownloadError({ url: urlText, cause: error });
  }
}
var name62 = "AI_InvalidDataContentError";
var marker62 = `vercel.ai.error.${name62}`;
var symbol62 = Symbol.for(marker62);
var _a62;
var InvalidDataContentError = class extends AISDKError {
  constructor({
    content,
    cause,
    message = `Invalid data content. Expected a base64 string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`
  }) {
    super({ name: name62, message, cause });
    this[_a62] = true;
    this.content = content;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker62);
  }
};
_a62 = symbol62;
var dataContentSchema = external_exports.union([
  external_exports.string(),
  external_exports.instanceof(Uint8Array),
  external_exports.instanceof(ArrayBuffer),
  external_exports.custom(
    // Buffer might not be available in some environments such as CloudFlare:
    (value) => {
      var _a17, _b;
      return (_b = (_a17 = globalThis.Buffer) == null ? void 0 : _a17.isBuffer(value)) != null ? _b : false;
    },
    { message: "Must be a Buffer" }
  )
]);
function convertDataContentToBase64String(content) {
  if (typeof content === "string") {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return convertUint8ArrayToBase64(new Uint8Array(content));
  }
  return convertUint8ArrayToBase64(content);
}
function convertDataContentToUint8Array(content) {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    try {
      return convertBase64ToUint8Array(content);
    } catch (error) {
      throw new InvalidDataContentError({
        message: "Invalid data content. Content string is not a base64-encoded media.",
        content,
        cause: error
      });
    }
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  throw new InvalidDataContentError({ content });
}
function convertUint8ArrayToText(uint8Array) {
  try {
    return new TextDecoder().decode(uint8Array);
  } catch (error) {
    throw new Error("Error decoding Uint8Array to text");
  }
}
var name72 = "AI_InvalidMessageRoleError";
var marker72 = `vercel.ai.error.${name72}`;
var symbol72 = Symbol.for(marker72);
var _a72;
var InvalidMessageRoleError = class extends AISDKError {
  constructor({
    role,
    message = `Invalid message role: '${role}'. Must be one of: "system", "user", "assistant", "tool".`
  }) {
    super({ name: name72, message });
    this[_a72] = true;
    this.role = role;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker72);
  }
};
_a72 = symbol72;
function splitDataUrl(dataUrl) {
  try {
    const [header, base64Content] = dataUrl.split(",");
    return {
      mimeType: header.split(";")[0].split(":")[1],
      base64Content
    };
  } catch (error) {
    return {
      mimeType: void 0,
      base64Content: void 0
    };
  }
}
async function convertToLanguageModelPrompt({
  prompt,
  modelSupportsImageUrls = true,
  modelSupportsUrl = () => false,
  downloadImplementation = download
}) {
  const downloadedAssets = await downloadAssets(
    prompt.messages,
    downloadImplementation,
    modelSupportsImageUrls,
    modelSupportsUrl
  );
  return [
    ...prompt.system != null ? [{ role: "system", content: prompt.system }] : [],
    ...prompt.messages.map(
      (message) => convertToLanguageModelMessage(message, downloadedAssets)
    )
  ];
}
function convertToLanguageModelMessage(message, downloadedAssets) {
  var _a17, _b, _c, _d, _e, _f;
  const role = message.role;
  switch (role) {
    case "system": {
      return {
        role: "system",
        content: message.content,
        providerMetadata: (_a17 = message.providerOptions) != null ? _a17 : message.experimental_providerMetadata
      };
    }
    case "user": {
      if (typeof message.content === "string") {
        return {
          role: "user",
          content: [{ type: "text", text: message.content }],
          providerMetadata: (_b = message.providerOptions) != null ? _b : message.experimental_providerMetadata
        };
      }
      return {
        role: "user",
        content: message.content.map((part) => convertPartToLanguageModelPart(part, downloadedAssets)).filter((part) => part.type !== "text" || part.text !== ""),
        providerMetadata: (_c = message.providerOptions) != null ? _c : message.experimental_providerMetadata
      };
    }
    case "assistant": {
      if (typeof message.content === "string") {
        return {
          role: "assistant",
          content: [{ type: "text", text: message.content }],
          providerMetadata: (_d = message.providerOptions) != null ? _d : message.experimental_providerMetadata
        };
      }
      return {
        role: "assistant",
        content: message.content.filter(
          // remove empty text parts:
          (part) => part.type !== "text" || part.text !== ""
        ).map((part) => {
          var _a18;
          const providerOptions = (_a18 = part.providerOptions) != null ? _a18 : part.experimental_providerMetadata;
          switch (part.type) {
            case "file": {
              return {
                type: "file",
                data: part.data instanceof URL ? part.data : convertDataContentToBase64String(part.data),
                filename: part.filename,
                mimeType: part.mimeType,
                providerMetadata: providerOptions
              };
            }
            case "reasoning": {
              return {
                type: "reasoning",
                text: part.text,
                signature: part.signature,
                providerMetadata: providerOptions
              };
            }
            case "redacted-reasoning": {
              return {
                type: "redacted-reasoning",
                data: part.data,
                providerMetadata: providerOptions
              };
            }
            case "text": {
              return {
                type: "text",
                text: part.text,
                providerMetadata: providerOptions
              };
            }
            case "tool-call": {
              return {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args,
                providerMetadata: providerOptions
              };
            }
          }
        }),
        providerMetadata: (_e = message.providerOptions) != null ? _e : message.experimental_providerMetadata
      };
    }
    case "tool": {
      return {
        role: "tool",
        content: message.content.map((part) => {
          var _a18;
          return {
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
            content: part.experimental_content,
            isError: part.isError,
            providerMetadata: (_a18 = part.providerOptions) != null ? _a18 : part.experimental_providerMetadata
          };
        }),
        providerMetadata: (_f = message.providerOptions) != null ? _f : message.experimental_providerMetadata
      };
    }
    default: {
      const _exhaustiveCheck = role;
      throw new InvalidMessageRoleError({ role: _exhaustiveCheck });
    }
  }
}
async function downloadAssets(messages, downloadImplementation, modelSupportsImageUrls, modelSupportsUrl) {
  const urls = messages.filter((message) => message.role === "user").map((message) => message.content).filter(
    (content) => Array.isArray(content)
  ).flat().filter(
    (part) => part.type === "image" || part.type === "file"
  ).filter(
    (part) => !(part.type === "image" && modelSupportsImageUrls === true)
  ).map((part) => part.type === "image" ? part.image : part.data).map(
    (part) => (
      // support string urls:
      typeof part === "string" && (part.startsWith("http:") || part.startsWith("https:")) ? new URL(part) : part
    )
  ).filter((image) => image instanceof URL).filter((url) => !modelSupportsUrl(url));
  const downloadedImages = await Promise.all(
    urls.map(async (url) => ({
      url,
      data: await downloadImplementation({ url })
    }))
  );
  return Object.fromEntries(
    downloadedImages.map(({ url, data }) => [url.toString(), data])
  );
}
function convertPartToLanguageModelPart(part, downloadedAssets) {
  var _a17, _b, _c, _d;
  if (part.type === "text") {
    return {
      type: "text",
      text: part.text,
      providerMetadata: (_a17 = part.providerOptions) != null ? _a17 : part.experimental_providerMetadata
    };
  }
  let mimeType = part.mimeType;
  let data;
  let content;
  let normalizedData;
  const type = part.type;
  switch (type) {
    case "image":
      data = part.image;
      break;
    case "file":
      data = part.data;
      break;
    default:
      throw new Error(`Unsupported part type: ${type}`);
  }
  try {
    content = typeof data === "string" ? new URL(data) : data;
  } catch (error) {
    content = data;
  }
  if (content instanceof URL) {
    if (content.protocol === "data:") {
      const { mimeType: dataUrlMimeType, base64Content } = splitDataUrl(
        content.toString()
      );
      if (dataUrlMimeType == null || base64Content == null) {
        throw new Error(`Invalid data URL format in part ${type}`);
      }
      mimeType = dataUrlMimeType;
      normalizedData = convertDataContentToUint8Array(base64Content);
    } else {
      const downloadedFile = downloadedAssets[content.toString()];
      if (downloadedFile) {
        normalizedData = downloadedFile.data;
        mimeType != null ? mimeType : mimeType = downloadedFile.mimeType;
      } else {
        normalizedData = content;
      }
    }
  } else {
    normalizedData = convertDataContentToUint8Array(content);
  }
  switch (type) {
    case "image": {
      if (normalizedData instanceof Uint8Array) {
        mimeType = (_b = detectMimeType({
          data: normalizedData,
          signatures: imageMimeTypeSignatures
        })) != null ? _b : mimeType;
      }
      return {
        type: "image",
        image: normalizedData,
        mimeType,
        providerMetadata: (_c = part.providerOptions) != null ? _c : part.experimental_providerMetadata
      };
    }
    case "file": {
      if (mimeType == null) {
        throw new Error(`Mime type is missing for file part`);
      }
      return {
        type: "file",
        data: normalizedData instanceof Uint8Array ? convertDataContentToBase64String(normalizedData) : normalizedData,
        filename: part.filename,
        mimeType,
        providerMetadata: (_d = part.providerOptions) != null ? _d : part.experimental_providerMetadata
      };
    }
  }
}
function prepareCallSettings({
  maxTokens,
  temperature,
  topP,
  topK,
  presencePenalty,
  frequencyPenalty,
  stopSequences,
  seed
}) {
  if (maxTokens != null) {
    if (!Number.isInteger(maxTokens)) {
      throw new InvalidArgumentError2({
        parameter: "maxTokens",
        value: maxTokens,
        message: "maxTokens must be an integer"
      });
    }
    if (maxTokens < 1) {
      throw new InvalidArgumentError2({
        parameter: "maxTokens",
        value: maxTokens,
        message: "maxTokens must be >= 1"
      });
    }
  }
  if (temperature != null) {
    if (typeof temperature !== "number") {
      throw new InvalidArgumentError2({
        parameter: "temperature",
        value: temperature,
        message: "temperature must be a number"
      });
    }
  }
  if (topP != null) {
    if (typeof topP !== "number") {
      throw new InvalidArgumentError2({
        parameter: "topP",
        value: topP,
        message: "topP must be a number"
      });
    }
  }
  if (topK != null) {
    if (typeof topK !== "number") {
      throw new InvalidArgumentError2({
        parameter: "topK",
        value: topK,
        message: "topK must be a number"
      });
    }
  }
  if (presencePenalty != null) {
    if (typeof presencePenalty !== "number") {
      throw new InvalidArgumentError2({
        parameter: "presencePenalty",
        value: presencePenalty,
        message: "presencePenalty must be a number"
      });
    }
  }
  if (frequencyPenalty != null) {
    if (typeof frequencyPenalty !== "number") {
      throw new InvalidArgumentError2({
        parameter: "frequencyPenalty",
        value: frequencyPenalty,
        message: "frequencyPenalty must be a number"
      });
    }
  }
  if (seed != null) {
    if (!Number.isInteger(seed)) {
      throw new InvalidArgumentError2({
        parameter: "seed",
        value: seed,
        message: "seed must be an integer"
      });
    }
  }
  return {
    maxTokens,
    // TODO v5 remove default 0 for temperature
    temperature: temperature != null ? temperature : 0,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    stopSequences: stopSequences != null && stopSequences.length > 0 ? stopSequences : void 0,
    seed
  };
}
function attachmentsToParts(attachments) {
  var _a17, _b, _c;
  const parts = [];
  for (const attachment of attachments) {
    let url;
    try {
      url = new URL(attachment.url);
    } catch (error) {
      throw new Error(`Invalid URL: ${attachment.url}`);
    }
    switch (url.protocol) {
      case "http:":
      case "https:": {
        if ((_a17 = attachment.contentType) == null ? void 0 : _a17.startsWith("image/")) {
          parts.push({ type: "image", image: url });
        } else {
          if (!attachment.contentType) {
            throw new Error(
              "If the attachment is not an image, it must specify a content type"
            );
          }
          parts.push({
            type: "file",
            data: url,
            mimeType: attachment.contentType
          });
        }
        break;
      }
      case "data:": {
        let header;
        let base64Content;
        let mimeType;
        try {
          [header, base64Content] = attachment.url.split(",");
          mimeType = header.split(";")[0].split(":")[1];
        } catch (error) {
          throw new Error(`Error processing data URL: ${attachment.url}`);
        }
        if (mimeType == null || base64Content == null) {
          throw new Error(`Invalid data URL format: ${attachment.url}`);
        }
        if ((_b = attachment.contentType) == null ? void 0 : _b.startsWith("image/")) {
          parts.push({
            type: "image",
            image: convertDataContentToUint8Array(base64Content)
          });
        } else if ((_c = attachment.contentType) == null ? void 0 : _c.startsWith("text/")) {
          parts.push({
            type: "text",
            text: convertUint8ArrayToText(
              convertDataContentToUint8Array(base64Content)
            )
          });
        } else {
          if (!attachment.contentType) {
            throw new Error(
              "If the attachment is not an image or text, it must specify a content type"
            );
          }
          parts.push({
            type: "file",
            data: base64Content,
            mimeType: attachment.contentType
          });
        }
        break;
      }
      default: {
        throw new Error(`Unsupported URL protocol: ${url.protocol}`);
      }
    }
  }
  return parts;
}
var name82 = "AI_MessageConversionError";
var marker82 = `vercel.ai.error.${name82}`;
var symbol82 = Symbol.for(marker82);
var _a82;
var MessageConversionError = class extends AISDKError {
  constructor({
    originalMessage,
    message
  }) {
    super({ name: name82, message });
    this[_a82] = true;
    this.originalMessage = originalMessage;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker82);
  }
};
_a82 = symbol82;
function convertToCoreMessages(messages, options) {
  var _a17, _b;
  const tools = (_a17 = options == null ? void 0 : options.tools) != null ? _a17 : {};
  const coreMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const isLastMessage = i === messages.length - 1;
    const { role, content, experimental_attachments } = message;
    switch (role) {
      case "system": {
        coreMessages.push({
          role: "system",
          content
        });
        break;
      }
      case "user": {
        if (message.parts == null) {
          coreMessages.push({
            role: "user",
            content: experimental_attachments ? [
              { type: "text", text: content },
              ...attachmentsToParts(experimental_attachments)
            ] : content
          });
        } else {
          const textParts = message.parts.filter((part) => part.type === "text").map((part) => ({
            type: "text",
            text: part.text
          }));
          coreMessages.push({
            role: "user",
            content: experimental_attachments ? [...textParts, ...attachmentsToParts(experimental_attachments)] : textParts
          });
        }
        break;
      }
      case "assistant": {
        if (message.parts != null) {
          let processBlock2 = function() {
            const content2 = [];
            for (const part of block) {
              switch (part.type) {
                case "file":
                case "text": {
                  content2.push(part);
                  break;
                }
                case "reasoning": {
                  for (const detail of part.details) {
                    switch (detail.type) {
                      case "text":
                        content2.push({
                          type: "reasoning",
                          text: detail.text,
                          signature: detail.signature
                        });
                        break;
                      case "redacted":
                        content2.push({
                          type: "redacted-reasoning",
                          data: detail.data
                        });
                        break;
                    }
                  }
                  break;
                }
                case "tool-invocation":
                  content2.push({
                    type: "tool-call",
                    toolCallId: part.toolInvocation.toolCallId,
                    toolName: part.toolInvocation.toolName,
                    args: part.toolInvocation.args
                  });
                  break;
                default: {
                  const _exhaustiveCheck = part;
                  throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
                }
              }
            }
            coreMessages.push({
              role: "assistant",
              content: content2
            });
            const stepInvocations = block.filter(
              (part) => part.type === "tool-invocation"
            ).map((part) => part.toolInvocation);
            if (stepInvocations.length > 0) {
              coreMessages.push({
                role: "tool",
                content: stepInvocations.map(
                  (toolInvocation) => {
                    if (!("result" in toolInvocation)) {
                      throw new MessageConversionError({
                        originalMessage: message,
                        message: "ToolInvocation must have a result: " + JSON.stringify(toolInvocation)
                      });
                    }
                    const { toolCallId, toolName, result } = toolInvocation;
                    const tool2 = tools[toolName];
                    return (tool2 == null ? void 0 : tool2.experimental_toToolResultContent) != null ? {
                      type: "tool-result",
                      toolCallId,
                      toolName,
                      result: tool2.experimental_toToolResultContent(result),
                      experimental_content: tool2.experimental_toToolResultContent(result)
                    } : {
                      type: "tool-result",
                      toolCallId,
                      toolName,
                      result
                    };
                  }
                )
              });
            }
            block = [];
            blockHasToolInvocations = false;
            currentStep++;
          };
          var processBlock = processBlock2;
          let currentStep = 0;
          let blockHasToolInvocations = false;
          let block = [];
          for (const part of message.parts) {
            switch (part.type) {
              case "text": {
                if (blockHasToolInvocations) {
                  processBlock2();
                }
                block.push(part);
                break;
              }
              case "file":
              case "reasoning": {
                block.push(part);
                break;
              }
              case "tool-invocation": {
                if (((_b = part.toolInvocation.step) != null ? _b : 0) !== currentStep) {
                  processBlock2();
                }
                block.push(part);
                blockHasToolInvocations = true;
                break;
              }
            }
          }
          processBlock2();
          break;
        }
        const toolInvocations = message.toolInvocations;
        if (toolInvocations == null || toolInvocations.length === 0) {
          coreMessages.push({ role: "assistant", content });
          break;
        }
        const maxStep = toolInvocations.reduce((max, toolInvocation) => {
          var _a18;
          return Math.max(max, (_a18 = toolInvocation.step) != null ? _a18 : 0);
        }, 0);
        for (let i2 = 0; i2 <= maxStep; i2++) {
          const stepInvocations = toolInvocations.filter(
            (toolInvocation) => {
              var _a18;
              return ((_a18 = toolInvocation.step) != null ? _a18 : 0) === i2;
            }
          );
          if (stepInvocations.length === 0) {
            continue;
          }
          coreMessages.push({
            role: "assistant",
            content: [
              ...isLastMessage && content && i2 === 0 ? [{ type: "text", text: content }] : [],
              ...stepInvocations.map(
                ({ toolCallId, toolName, args }) => ({
                  type: "tool-call",
                  toolCallId,
                  toolName,
                  args
                })
              )
            ]
          });
          coreMessages.push({
            role: "tool",
            content: stepInvocations.map((toolInvocation) => {
              if (!("result" in toolInvocation)) {
                throw new MessageConversionError({
                  originalMessage: message,
                  message: "ToolInvocation must have a result: " + JSON.stringify(toolInvocation)
                });
              }
              const { toolCallId, toolName, result } = toolInvocation;
              const tool2 = tools[toolName];
              return (tool2 == null ? void 0 : tool2.experimental_toToolResultContent) != null ? {
                type: "tool-result",
                toolCallId,
                toolName,
                result: tool2.experimental_toToolResultContent(result),
                experimental_content: tool2.experimental_toToolResultContent(result)
              } : {
                type: "tool-result",
                toolCallId,
                toolName,
                result
              };
            })
          });
        }
        if (content && !isLastMessage) {
          coreMessages.push({ role: "assistant", content });
        }
        break;
      }
      case "data": {
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported role: ${_exhaustiveCheck}`
        });
      }
    }
  }
  return coreMessages;
}
var jsonValueSchema = external_exports.lazy(
  () => external_exports.union([
    external_exports.null(),
    external_exports.string(),
    external_exports.number(),
    external_exports.boolean(),
    external_exports.record(external_exports.string(), jsonValueSchema),
    external_exports.array(jsonValueSchema)
  ])
);
var providerMetadataSchema = external_exports.record(
  external_exports.string(),
  external_exports.record(external_exports.string(), jsonValueSchema)
);
var toolResultContentSchema = external_exports.array(
  external_exports.union([
    external_exports.object({ type: external_exports.literal("text"), text: external_exports.string() }),
    external_exports.object({
      type: external_exports.literal("image"),
      data: external_exports.string(),
      mimeType: external_exports.string().optional()
    })
  ])
);
var textPartSchema = external_exports.object({
  type: external_exports.literal("text"),
  text: external_exports.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var imagePartSchema = external_exports.object({
  type: external_exports.literal("image"),
  image: external_exports.union([dataContentSchema, external_exports.instanceof(URL)]),
  mimeType: external_exports.string().optional(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var filePartSchema = external_exports.object({
  type: external_exports.literal("file"),
  data: external_exports.union([dataContentSchema, external_exports.instanceof(URL)]),
  filename: external_exports.string().optional(),
  mimeType: external_exports.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var reasoningPartSchema = external_exports.object({
  type: external_exports.literal("reasoning"),
  text: external_exports.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var redactedReasoningPartSchema = external_exports.object({
  type: external_exports.literal("redacted-reasoning"),
  data: external_exports.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var toolCallPartSchema = external_exports.object({
  type: external_exports.literal("tool-call"),
  toolCallId: external_exports.string(),
  toolName: external_exports.string(),
  args: external_exports.unknown(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var toolResultPartSchema = external_exports.object({
  type: external_exports.literal("tool-result"),
  toolCallId: external_exports.string(),
  toolName: external_exports.string(),
  result: external_exports.unknown(),
  content: toolResultContentSchema.optional(),
  isError: external_exports.boolean().optional(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var coreSystemMessageSchema = external_exports.object({
  role: external_exports.literal("system"),
  content: external_exports.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var coreUserMessageSchema = external_exports.object({
  role: external_exports.literal("user"),
  content: external_exports.union([
    external_exports.string(),
    external_exports.array(external_exports.union([textPartSchema, imagePartSchema, filePartSchema]))
  ]),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var coreAssistantMessageSchema = external_exports.object({
  role: external_exports.literal("assistant"),
  content: external_exports.union([
    external_exports.string(),
    external_exports.array(
      external_exports.union([
        textPartSchema,
        filePartSchema,
        reasoningPartSchema,
        redactedReasoningPartSchema,
        toolCallPartSchema
      ])
    )
  ]),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var coreToolMessageSchema = external_exports.object({
  role: external_exports.literal("tool"),
  content: external_exports.array(toolResultPartSchema),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional()
});
var coreMessageSchema = external_exports.union([
  coreSystemMessageSchema,
  coreUserMessageSchema,
  coreAssistantMessageSchema,
  coreToolMessageSchema
]);
function standardizePrompt({
  prompt,
  tools
}) {
  if (prompt.prompt == null && prompt.messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: "prompt or messages must be defined"
    });
  }
  if (prompt.prompt != null && prompt.messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: "prompt and messages cannot be defined at the same time"
    });
  }
  if (prompt.system != null && typeof prompt.system !== "string") {
    throw new InvalidPromptError({
      prompt,
      message: "system must be a string"
    });
  }
  if (prompt.prompt != null) {
    if (typeof prompt.prompt !== "string") {
      throw new InvalidPromptError({
        prompt,
        message: "prompt must be a string"
      });
    }
    return {
      type: "prompt",
      system: prompt.system,
      messages: [
        {
          role: "user",
          content: prompt.prompt
        }
      ]
    };
  }
  if (prompt.messages != null) {
    const promptType = detectPromptType(prompt.messages);
    const messages = promptType === "ui-messages" ? convertToCoreMessages(prompt.messages, {
      tools
    }) : prompt.messages;
    if (messages.length === 0) {
      throw new InvalidPromptError({
        prompt,
        message: "messages must not be empty"
      });
    }
    const validationResult = safeValidateTypes({
      value: messages,
      schema: external_exports.array(coreMessageSchema)
    });
    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: [
          "message must be a CoreMessage or a UI message",
          `Validation error: ${validationResult.error.message}`
        ].join("\n"),
        cause: validationResult.error
      });
    }
    return {
      type: "messages",
      messages,
      system: prompt.system
    };
  }
  throw new Error("unreachable");
}
function detectPromptType(prompt) {
  if (!Array.isArray(prompt)) {
    throw new InvalidPromptError({
      prompt,
      message: [
        "messages must be an array of CoreMessage or UIMessage",
        `Received non-array value: ${JSON.stringify(prompt)}`
      ].join("\n"),
      cause: prompt
    });
  }
  if (prompt.length === 0) {
    return "messages";
  }
  const characteristics = prompt.map(detectSingleMessageCharacteristics);
  if (characteristics.some((c) => c === "has-ui-specific-parts")) {
    return "ui-messages";
  }
  const nonMessageIndex = characteristics.findIndex(
    (c) => c !== "has-core-specific-parts" && c !== "message"
  );
  if (nonMessageIndex === -1) {
    return "messages";
  }
  throw new InvalidPromptError({
    prompt,
    message: [
      "messages must be an array of CoreMessage or UIMessage",
      `Received message of type: "${characteristics[nonMessageIndex]}" at index ${nonMessageIndex}`,
      `messages[${nonMessageIndex}]: ${JSON.stringify(prompt[nonMessageIndex])}`
    ].join("\n"),
    cause: prompt
  });
}
function detectSingleMessageCharacteristics(message) {
  if (typeof message === "object" && message !== null && (message.role === "function" || // UI-only role
  message.role === "data" || // UI-only role
  "toolInvocations" in message || // UI-specific field
  "parts" in message || // UI-specific field
  "experimental_attachments" in message)) {
    return "has-ui-specific-parts";
  } else if (typeof message === "object" && message !== null && "content" in message && (Array.isArray(message.content) || // Core messages can have array content
  "experimental_providerMetadata" in message || "providerOptions" in message)) {
    return "has-core-specific-parts";
  } else if (typeof message === "object" && message !== null && "role" in message && "content" in message && typeof message.content === "string" && ["system", "user", "assistant", "tool"].includes(message.role)) {
    return "message";
  } else {
    return "other";
  }
}
function calculateLanguageModelUsage({
  promptTokens,
  completionTokens
}) {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  };
}
var DEFAULT_SCHEMA_PREFIX = "JSON schema:";
var DEFAULT_SCHEMA_SUFFIX = "You MUST answer with a JSON object that matches the JSON schema above.";
var DEFAULT_GENERIC_SUFFIX = "You MUST answer with JSON.";
function injectJsonInstruction({
  prompt,
  schema,
  schemaPrefix = schema != null ? DEFAULT_SCHEMA_PREFIX : void 0,
  schemaSuffix = schema != null ? DEFAULT_SCHEMA_SUFFIX : DEFAULT_GENERIC_SUFFIX
}) {
  return [
    prompt != null && prompt.length > 0 ? prompt : void 0,
    prompt != null && prompt.length > 0 ? "" : void 0,
    // add a newline if prompt is not null
    schemaPrefix,
    schema != null ? JSON.stringify(schema) : void 0,
    schemaSuffix
  ].filter((line) => line != null).join("\n");
}
function createAsyncIterableStream(source) {
  const stream = source.pipeThrough(new TransformStream());
  stream[Symbol.asyncIterator] = () => {
    const reader = stream.getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        return done ? { done: true, value: void 0 } : { done: false, value };
      }
    };
  };
  return stream;
}
var noSchemaOutputStrategy = {
  type: "no-schema",
  jsonSchema: void 0,
  validatePartialResult({ value, textDelta }) {
    return { success: true, value: { partial: value, textDelta } };
  },
  validateFinalResult(value, context) {
    return value === void 0 ? {
      success: false,
      error: new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        text: context.text,
        response: context.response,
        usage: context.usage,
        finishReason: context.finishReason
      })
    } : { success: true, value };
  },
  createElementStream() {
    throw new UnsupportedFunctionalityError({
      functionality: "element streams in no-schema mode"
    });
  }
};
var objectOutputStrategy = (schema) => ({
  type: "object",
  jsonSchema: schema.jsonSchema,
  validatePartialResult({ value, textDelta }) {
    return {
      success: true,
      value: {
        // Note: currently no validation of partial results:
        partial: value,
        textDelta
      }
    };
  },
  validateFinalResult(value) {
    return safeValidateTypes({ value, schema });
  },
  createElementStream() {
    throw new UnsupportedFunctionalityError({
      functionality: "element streams in object mode"
    });
  }
});
var arrayOutputStrategy = (schema) => {
  const { $schema, ...itemSchema } = schema.jsonSchema;
  return {
    type: "enum",
    // wrap in object that contains array of elements, since most LLMs will not
    // be able to generate an array directly:
    // possible future optimization: use arrays directly when model supports grammar-guided generation
    jsonSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        elements: { type: "array", items: itemSchema }
      },
      required: ["elements"],
      additionalProperties: false
    },
    validatePartialResult({ value, latestObject, isFirstDelta, isFinalDelta }) {
      var _a17;
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError({
            value,
            cause: "value must be an object that contains an array of elements"
          })
        };
      }
      const inputArray = value.elements;
      const resultArray = [];
      for (let i = 0; i < inputArray.length; i++) {
        const element = inputArray[i];
        const result = safeValidateTypes({ value: element, schema });
        if (i === inputArray.length - 1 && !isFinalDelta) {
          continue;
        }
        if (!result.success) {
          return result;
        }
        resultArray.push(result.value);
      }
      const publishedElementCount = (_a17 = latestObject == null ? void 0 : latestObject.length) != null ? _a17 : 0;
      let textDelta = "";
      if (isFirstDelta) {
        textDelta += "[";
      }
      if (publishedElementCount > 0) {
        textDelta += ",";
      }
      textDelta += resultArray.slice(publishedElementCount).map((element) => JSON.stringify(element)).join(",");
      if (isFinalDelta) {
        textDelta += "]";
      }
      return {
        success: true,
        value: {
          partial: resultArray,
          textDelta
        }
      };
    },
    validateFinalResult(value) {
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError({
            value,
            cause: "value must be an object that contains an array of elements"
          })
        };
      }
      const inputArray = value.elements;
      for (const element of inputArray) {
        const result = safeValidateTypes({ value: element, schema });
        if (!result.success) {
          return result;
        }
      }
      return { success: true, value: inputArray };
    },
    createElementStream(originalStream) {
      let publishedElements = 0;
      return createAsyncIterableStream(
        originalStream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              switch (chunk.type) {
                case "object": {
                  const array = chunk.object;
                  for (; publishedElements < array.length; publishedElements++) {
                    controller.enqueue(array[publishedElements]);
                  }
                  break;
                }
                case "text-delta":
                case "finish":
                case "error":
                  break;
                default: {
                  const _exhaustiveCheck = chunk;
                  throw new Error(
                    `Unsupported chunk type: ${_exhaustiveCheck}`
                  );
                }
              }
            }
          })
        )
      );
    }
  };
};
var enumOutputStrategy = (enumValues) => {
  return {
    type: "enum",
    // wrap in object that contains result, since most LLMs will not
    // be able to generate an enum value directly:
    // possible future optimization: use enums directly when model supports top-level enums
    jsonSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        result: { type: "string", enum: enumValues }
      },
      required: ["result"],
      additionalProperties: false
    },
    validateFinalResult(value) {
      if (!isJSONObject(value) || typeof value.result !== "string") {
        return {
          success: false,
          error: new TypeValidationError({
            value,
            cause: 'value must be an object that contains a string in the "result" property.'
          })
        };
      }
      const result = value.result;
      return enumValues.includes(result) ? { success: true, value: result } : {
        success: false,
        error: new TypeValidationError({
          value,
          cause: "value must be a string in the enum"
        })
      };
    },
    validatePartialResult() {
      throw new UnsupportedFunctionalityError({
        functionality: "partial results in enum mode"
      });
    },
    createElementStream() {
      throw new UnsupportedFunctionalityError({
        functionality: "element streams in enum mode"
      });
    }
  };
};
function getOutputStrategy({
  output,
  schema,
  enumValues
}) {
  switch (output) {
    case "object":
      return objectOutputStrategy(asSchema(schema));
    case "array":
      return arrayOutputStrategy(asSchema(schema));
    case "enum":
      return enumOutputStrategy(enumValues);
    case "no-schema":
      return noSchemaOutputStrategy;
    default: {
      const _exhaustiveCheck = output;
      throw new Error(`Unsupported output: ${_exhaustiveCheck}`);
    }
  }
}
function validateObjectGenerationInput({
  output,
  mode,
  schema,
  schemaName,
  schemaDescription,
  enumValues
}) {
  if (output != null && output !== "object" && output !== "array" && output !== "enum" && output !== "no-schema") {
    throw new InvalidArgumentError2({
      parameter: "output",
      value: output,
      message: "Invalid output type."
    });
  }
  if (output === "no-schema") {
    if (mode === "auto" || mode === "tool") {
      throw new InvalidArgumentError2({
        parameter: "mode",
        value: mode,
        message: 'Mode must be "json" for no-schema output.'
      });
    }
    if (schema != null) {
      throw new InvalidArgumentError2({
        parameter: "schema",
        value: schema,
        message: "Schema is not supported for no-schema output."
      });
    }
    if (schemaDescription != null) {
      throw new InvalidArgumentError2({
        parameter: "schemaDescription",
        value: schemaDescription,
        message: "Schema description is not supported for no-schema output."
      });
    }
    if (schemaName != null) {
      throw new InvalidArgumentError2({
        parameter: "schemaName",
        value: schemaName,
        message: "Schema name is not supported for no-schema output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError2({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for no-schema output."
      });
    }
  }
  if (output === "object") {
    if (schema == null) {
      throw new InvalidArgumentError2({
        parameter: "schema",
        value: schema,
        message: "Schema is required for object output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError2({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for object output."
      });
    }
  }
  if (output === "array") {
    if (schema == null) {
      throw new InvalidArgumentError2({
        parameter: "schema",
        value: schema,
        message: "Element schema is required for array output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError2({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for array output."
      });
    }
  }
  if (output === "enum") {
    if (schema != null) {
      throw new InvalidArgumentError2({
        parameter: "schema",
        value: schema,
        message: "Schema is not supported for enum output."
      });
    }
    if (schemaDescription != null) {
      throw new InvalidArgumentError2({
        parameter: "schemaDescription",
        value: schemaDescription,
        message: "Schema description is not supported for enum output."
      });
    }
    if (schemaName != null) {
      throw new InvalidArgumentError2({
        parameter: "schemaName",
        value: schemaName,
        message: "Schema name is not supported for enum output."
      });
    }
    if (enumValues == null) {
      throw new InvalidArgumentError2({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are required for enum output."
      });
    }
    for (const value of enumValues) {
      if (typeof value !== "string") {
        throw new InvalidArgumentError2({
          parameter: "enumValues",
          value,
          message: "Enum values must be strings."
        });
      }
    }
  }
}
function stringifyForTelemetry(prompt) {
  const processedPrompt = prompt.map((message) => {
    return {
      ...message,
      content: typeof message.content === "string" ? message.content : message.content.map(processPart)
    };
  });
  return JSON.stringify(processedPrompt);
}
function processPart(part) {
  if (part.type === "image") {
    return {
      ...part,
      image: part.image instanceof Uint8Array ? convertDataContentToBase64String(part.image) : part.image
    };
  }
  return part;
}
var originalGenerateId = createIdGenerator({ prefix: "aiobj", size: 24 });
async function generateObject({
  model,
  enum: enumValues,
  // rename bc enum is reserved by typescript
  schema: inputSchema,
  schemaName,
  schemaDescription,
  mode,
  output = "object",
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers: headers9,
  experimental_repairText: repairText,
  experimental_telemetry: telemetry,
  experimental_providerMetadata,
  providerOptions = experimental_providerMetadata,
  _internal: {
    generateId: generateId3 = originalGenerateId,
    currentDate = () => /* @__PURE__ */ new Date()
  } = {},
  ...settings
}) {
  if (typeof model === "string" || model.specificationVersion !== "v1") {
    throw new UnsupportedModelVersionError();
  }
  validateObjectGenerationInput({
    output,
    mode,
    schema: inputSchema,
    schemaName,
    schemaDescription,
    enumValues
  });
  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });
  const outputStrategy = getOutputStrategy({
    output,
    schema: inputSchema,
    enumValues
  });
  if (outputStrategy.type === "no-schema" && mode === void 0) {
    mode = "json";
  }
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headers9,
    settings: { ...settings, maxRetries }
  });
  const tracer = getTracer(telemetry);
  return recordSpan({
    name: "ai.generateObject",
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: "ai.generateObject",
          telemetry
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        "ai.prompt": {
          input: () => JSON.stringify({ system, prompt, messages })
        },
        "ai.schema": outputStrategy.jsonSchema != null ? { input: () => JSON.stringify(outputStrategy.jsonSchema) } : void 0,
        "ai.schema.name": schemaName,
        "ai.schema.description": schemaDescription,
        "ai.settings.output": outputStrategy.type,
        "ai.settings.mode": mode
      }
    }),
    tracer,
    fn: async (span) => {
      var _a17, _b, _c, _d;
      if (mode === "auto" || mode == null) {
        mode = model.defaultObjectGenerationMode;
      }
      let result;
      let finishReason;
      let usage;
      let warnings;
      let rawResponse;
      let response;
      let request;
      let logprobs;
      let resultProviderMetadata;
      switch (mode) {
        case "json": {
          const standardizedPrompt = standardizePrompt({
            prompt: {
              system: outputStrategy.jsonSchema == null ? injectJsonInstruction({ prompt: system }) : model.supportsStructuredOutputs ? system : injectJsonInstruction({
                prompt: system,
                schema: outputStrategy.jsonSchema
              }),
              prompt,
              messages
            },
            tools: void 0
          });
          const promptMessages = await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
            modelSupportsUrl: (_a17 = model.supportsUrl) == null ? void 0 : _a17.bind(model)
            // support 'this' context
          });
          const generateResult = await retry(
            () => recordSpan({
              name: "ai.generateObject.doGenerate",
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationId: "ai.generateObject.doGenerate",
                    telemetry
                  }),
                  ...baseTelemetryAttributes,
                  "ai.prompt.format": {
                    input: () => standardizedPrompt.type
                  },
                  "ai.prompt.messages": {
                    input: () => JSON.stringify(promptMessages)
                  },
                  "ai.settings.mode": mode,
                  // standardized gen-ai llm span attributes:
                  "gen_ai.system": model.provider,
                  "gen_ai.request.model": model.modelId,
                  "gen_ai.request.frequency_penalty": settings.frequencyPenalty,
                  "gen_ai.request.max_tokens": settings.maxTokens,
                  "gen_ai.request.presence_penalty": settings.presencePenalty,
                  "gen_ai.request.temperature": settings.temperature,
                  "gen_ai.request.top_k": settings.topK,
                  "gen_ai.request.top_p": settings.topP
                }
              }),
              tracer,
              fn: async (span2) => {
                var _a18, _b2, _c2, _d2, _e, _f;
                const result2 = await model.doGenerate({
                  mode: {
                    type: "object-json",
                    schema: outputStrategy.jsonSchema,
                    name: schemaName,
                    description: schemaDescription
                  },
                  ...prepareCallSettings(settings),
                  inputFormat: standardizedPrompt.type,
                  prompt: promptMessages,
                  providerMetadata: providerOptions,
                  abortSignal,
                  headers: headers9
                });
                const responseData = {
                  id: (_b2 = (_a18 = result2.response) == null ? void 0 : _a18.id) != null ? _b2 : generateId3(),
                  timestamp: (_d2 = (_c2 = result2.response) == null ? void 0 : _c2.timestamp) != null ? _d2 : currentDate(),
                  modelId: (_f = (_e = result2.response) == null ? void 0 : _e.modelId) != null ? _f : model.modelId
                };
                if (result2.text === void 0) {
                  throw new NoObjectGeneratedError({
                    message: "No object generated: the model did not return a response.",
                    response: responseData,
                    usage: calculateLanguageModelUsage(result2.usage),
                    finishReason: result2.finishReason
                  });
                }
                span2.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      "ai.response.finishReason": result2.finishReason,
                      "ai.response.object": { output: () => result2.text },
                      "ai.response.id": responseData.id,
                      "ai.response.model": responseData.modelId,
                      "ai.response.timestamp": responseData.timestamp.toISOString(),
                      "ai.response.providerMetadata": JSON.stringify(
                        result2.providerMetadata
                      ),
                      "ai.usage.promptTokens": result2.usage.promptTokens,
                      "ai.usage.completionTokens": result2.usage.completionTokens,
                      // standardized gen-ai llm span attributes:
                      "gen_ai.response.finish_reasons": [result2.finishReason],
                      "gen_ai.response.id": responseData.id,
                      "gen_ai.response.model": responseData.modelId,
                      "gen_ai.usage.prompt_tokens": result2.usage.promptTokens,
                      "gen_ai.usage.completion_tokens": result2.usage.completionTokens
                    }
                  })
                );
                return { ...result2, objectText: result2.text, responseData };
              }
            })
          );
          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          rawResponse = generateResult.rawResponse;
          logprobs = generateResult.logprobs;
          resultProviderMetadata = generateResult.providerMetadata;
          request = (_b = generateResult.request) != null ? _b : {};
          response = generateResult.responseData;
          break;
        }
        case "tool": {
          const standardizedPrompt = standardizePrompt({
            prompt: { system, prompt, messages },
            tools: void 0
          });
          const promptMessages = await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
            modelSupportsUrl: (_c = model.supportsUrl) == null ? void 0 : _c.bind(model)
            // support 'this' context,
          });
          const inputFormat = standardizedPrompt.type;
          const generateResult = await retry(
            () => recordSpan({
              name: "ai.generateObject.doGenerate",
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationId: "ai.generateObject.doGenerate",
                    telemetry
                  }),
                  ...baseTelemetryAttributes,
                  "ai.prompt.format": {
                    input: () => inputFormat
                  },
                  "ai.prompt.messages": {
                    input: () => stringifyForTelemetry(promptMessages)
                  },
                  "ai.settings.mode": mode,
                  // standardized gen-ai llm span attributes:
                  "gen_ai.system": model.provider,
                  "gen_ai.request.model": model.modelId,
                  "gen_ai.request.frequency_penalty": settings.frequencyPenalty,
                  "gen_ai.request.max_tokens": settings.maxTokens,
                  "gen_ai.request.presence_penalty": settings.presencePenalty,
                  "gen_ai.request.temperature": settings.temperature,
                  "gen_ai.request.top_k": settings.topK,
                  "gen_ai.request.top_p": settings.topP
                }
              }),
              tracer,
              fn: async (span2) => {
                var _a18, _b2, _c2, _d2, _e, _f, _g, _h;
                const result2 = await model.doGenerate({
                  mode: {
                    type: "object-tool",
                    tool: {
                      type: "function",
                      name: schemaName != null ? schemaName : "json",
                      description: schemaDescription != null ? schemaDescription : "Respond with a JSON object.",
                      parameters: outputStrategy.jsonSchema
                    }
                  },
                  ...prepareCallSettings(settings),
                  inputFormat,
                  prompt: promptMessages,
                  providerMetadata: providerOptions,
                  abortSignal,
                  headers: headers9
                });
                const objectText = (_b2 = (_a18 = result2.toolCalls) == null ? void 0 : _a18[0]) == null ? void 0 : _b2.args;
                const responseData = {
                  id: (_d2 = (_c2 = result2.response) == null ? void 0 : _c2.id) != null ? _d2 : generateId3(),
                  timestamp: (_f = (_e = result2.response) == null ? void 0 : _e.timestamp) != null ? _f : currentDate(),
                  modelId: (_h = (_g = result2.response) == null ? void 0 : _g.modelId) != null ? _h : model.modelId
                };
                if (objectText === void 0) {
                  throw new NoObjectGeneratedError({
                    message: "No object generated: the tool was not called.",
                    response: responseData,
                    usage: calculateLanguageModelUsage(result2.usage),
                    finishReason: result2.finishReason
                  });
                }
                span2.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      "ai.response.finishReason": result2.finishReason,
                      "ai.response.object": { output: () => objectText },
                      "ai.response.id": responseData.id,
                      "ai.response.model": responseData.modelId,
                      "ai.response.timestamp": responseData.timestamp.toISOString(),
                      "ai.response.providerMetadata": JSON.stringify(
                        result2.providerMetadata
                      ),
                      "ai.usage.promptTokens": result2.usage.promptTokens,
                      "ai.usage.completionTokens": result2.usage.completionTokens,
                      // standardized gen-ai llm span attributes:
                      "gen_ai.response.finish_reasons": [result2.finishReason],
                      "gen_ai.response.id": responseData.id,
                      "gen_ai.response.model": responseData.modelId,
                      "gen_ai.usage.input_tokens": result2.usage.promptTokens,
                      "gen_ai.usage.output_tokens": result2.usage.completionTokens
                    }
                  })
                );
                return { ...result2, objectText, responseData };
              }
            })
          );
          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          rawResponse = generateResult.rawResponse;
          logprobs = generateResult.logprobs;
          resultProviderMetadata = generateResult.providerMetadata;
          request = (_d = generateResult.request) != null ? _d : {};
          response = generateResult.responseData;
          break;
        }
        case void 0: {
          throw new Error(
            "Model does not have a default object generation mode."
          );
        }
        default: {
          const _exhaustiveCheck = mode;
          throw new Error(`Unsupported mode: ${_exhaustiveCheck}`);
        }
      }
      function processResult(result2) {
        const parseResult = safeParseJSON({ text: result2 });
        if (!parseResult.success) {
          throw new NoObjectGeneratedError({
            message: "No object generated: could not parse the response.",
            cause: parseResult.error,
            text: result2,
            response,
            usage: calculateLanguageModelUsage(usage),
            finishReason
          });
        }
        const validationResult = outputStrategy.validateFinalResult(
          parseResult.value,
          {
            text: result2,
            response,
            usage: calculateLanguageModelUsage(usage)
          }
        );
        if (!validationResult.success) {
          throw new NoObjectGeneratedError({
            message: "No object generated: response did not match schema.",
            cause: validationResult.error,
            text: result2,
            response,
            usage: calculateLanguageModelUsage(usage),
            finishReason
          });
        }
        return validationResult.value;
      }
      let object2;
      try {
        object2 = processResult(result);
      } catch (error) {
        if (repairText != null && NoObjectGeneratedError.isInstance(error) && (JSONParseError.isInstance(error.cause) || TypeValidationError.isInstance(error.cause))) {
          const repairedText = await repairText({
            text: result,
            error: error.cause
          });
          if (repairedText === null) {
            throw error;
          }
          object2 = processResult(repairedText);
        } else {
          throw error;
        }
      }
      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            "ai.response.finishReason": finishReason,
            "ai.response.object": {
              output: () => JSON.stringify(object2)
            },
            "ai.usage.promptTokens": usage.promptTokens,
            "ai.usage.completionTokens": usage.completionTokens
          }
        })
      );
      return new DefaultGenerateObjectResult({
        object: object2,
        finishReason,
        usage: calculateLanguageModelUsage(usage),
        warnings,
        request,
        response: {
          ...response,
          headers: rawResponse == null ? void 0 : rawResponse.headers,
          body: rawResponse == null ? void 0 : rawResponse.body
        },
        logprobs,
        providerMetadata: resultProviderMetadata
      });
    }
  });
}
var DefaultGenerateObjectResult = class {
  constructor(options) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.experimental_providerMetadata = options.providerMetadata;
    this.response = options.response;
    this.request = options.request;
    this.logprobs = options.logprobs;
  }
  toJsonResponse(init) {
    var _a17;
    return new Response(JSON.stringify(this.object), {
      status: (_a17 = init == null ? void 0 : init.status) != null ? _a17 : 200,
      headers: prepareResponseHeaders(init == null ? void 0 : init.headers, {
        contentType: "application/json; charset=utf-8"
      })
    });
  }
};
var originalGenerateId2 = createIdGenerator({ prefix: "aiobj", size: 24 });
var name92 = "AI_NoOutputSpecifiedError";
var marker92 = `vercel.ai.error.${name92}`;
var symbol92 = Symbol.for(marker92);
var _a92;
_a92 = symbol92;
var name102 = "AI_ToolExecutionError";
var marker102 = `vercel.ai.error.${name102}`;
var symbol102 = Symbol.for(marker102);
var _a102;
_a102 = symbol102;
var name112 = "AI_InvalidToolArgumentsError";
var marker112 = `vercel.ai.error.${name112}`;
var symbol112 = Symbol.for(marker112);
var _a112;
_a112 = symbol112;
var name122 = "AI_NoSuchToolError";
var marker122 = `vercel.ai.error.${name122}`;
var symbol122 = Symbol.for(marker122);
var _a122;
_a122 = symbol122;
var name132 = "AI_ToolCallRepairError";
var marker132 = `vercel.ai.error.${name132}`;
var symbol132 = Symbol.for(marker132);
var _a132;
_a132 = symbol132;
var originalGenerateId3 = createIdGenerator({
  prefix: "aitxt",
  size: 24
});
var originalGenerateMessageId = createIdGenerator({
  prefix: "msg",
  size: 24
});
var output_exports = {};
__export2(output_exports, {
  object: () => object,
  text: () => text
});
var name142 = "AI_InvalidStreamPartError";
var marker142 = `vercel.ai.error.${name142}`;
var symbol142 = Symbol.for(marker142);
var _a142;
_a142 = symbol142;
var name15 = "AI_MCPClientError";
var marker152 = `vercel.ai.error.${name15}`;
var symbol152 = Symbol.for(marker152);
var _a152;
_a152 = symbol152;
var text = () => ({
  type: "text",
  responseFormat: () => ({ type: "text" }),
  injectIntoSystemPrompt({ system }) {
    return system;
  },
  parsePartial({ text: text2 }) {
    return { partial: text2 };
  },
  parseOutput({ text: text2 }) {
    return text2;
  }
});
var object = ({
  schema: inputSchema
}) => {
  const schema = asSchema(inputSchema);
  return {
    type: "object",
    responseFormat: ({ model }) => ({
      type: "json",
      schema: model.supportsStructuredOutputs ? schema.jsonSchema : void 0
    }),
    injectIntoSystemPrompt({ system, model }) {
      return model.supportsStructuredOutputs ? system : injectJsonInstruction({
        prompt: system,
        schema: schema.jsonSchema
      });
    },
    parsePartial({ text: text2 }) {
      const result = parsePartialJson(text2);
      switch (result.state) {
        case "failed-parse":
        case "undefined-input":
          return void 0;
        case "repaired-parse":
        case "successful-parse":
          return {
            // Note: currently no validation of partial results:
            partial: result.value
          };
        default: {
          const _exhaustiveCheck = result.state;
          throw new Error(`Unsupported parse state: ${_exhaustiveCheck}`);
        }
      }
    },
    parseOutput({ text: text2 }, context) {
      const parseResult = safeParseJSON({ text: text2 });
      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: could not parse the response.",
          cause: parseResult.error,
          text: text2,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason
        });
      }
      const validationResult = safeValidateTypes({
        value: parseResult.value,
        schema
      });
      if (!validationResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: response did not match schema.",
          cause: validationResult.error,
          text: text2,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason
        });
      }
      return validationResult.value;
    }
  };
};
function mergeStreams(stream1, stream2) {
  const reader1 = stream1.getReader();
  const reader2 = stream2.getReader();
  let lastRead1 = void 0;
  let lastRead2 = void 0;
  let stream1Done = false;
  let stream2Done = false;
  async function readStream1(controller) {
    try {
      if (lastRead1 == null) {
        lastRead1 = reader1.read();
      }
      const result = await lastRead1;
      lastRead1 = void 0;
      if (!result.done) {
        controller.enqueue(result.value);
      } else {
        controller.close();
      }
    } catch (error) {
      controller.error(error);
    }
  }
  async function readStream2(controller) {
    try {
      if (lastRead2 == null) {
        lastRead2 = reader2.read();
      }
      const result = await lastRead2;
      lastRead2 = void 0;
      if (!result.done) {
        controller.enqueue(result.value);
      } else {
        controller.close();
      }
    } catch (error) {
      controller.error(error);
    }
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        if (stream1Done) {
          await readStream2(controller);
          return;
        }
        if (stream2Done) {
          await readStream1(controller);
          return;
        }
        if (lastRead1 == null) {
          lastRead1 = reader1.read();
        }
        if (lastRead2 == null) {
          lastRead2 = reader2.read();
        }
        const { result, reader } = await Promise.race([
          lastRead1.then((result2) => ({ result: result2, reader: reader1 })),
          lastRead2.then((result2) => ({ result: result2, reader: reader2 }))
        ]);
        if (!result.done) {
          controller.enqueue(result.value);
        }
        if (reader === reader1) {
          lastRead1 = void 0;
          if (result.done) {
            await readStream2(controller);
            stream1Done = true;
          }
        } else {
          lastRead2 = void 0;
          if (result.done) {
            stream2Done = true;
            await readStream1(controller);
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader1.cancel();
      reader2.cancel();
    }
  });
}
var originalGenerateId4 = createIdGenerator({
  prefix: "aitxt",
  size: 24
});
var originalGenerateMessageId2 = createIdGenerator({
  prefix: "msg",
  size: 24
});
var name16 = "AI_NoSuchProviderError";
var marker16 = `vercel.ai.error.${name16}`;
var symbol16 = Symbol.for(marker16);
var _a16;
_a16 = symbol16;
var ClientOrServerImplementationSchema = external_exports.object({
  name: external_exports.string(),
  version: external_exports.string()
}).passthrough();
var BaseParamsSchema = external_exports.object({
  _meta: external_exports.optional(external_exports.object({}).passthrough())
}).passthrough();
var ResultSchema = BaseParamsSchema;
var RequestSchema = external_exports.object({
  method: external_exports.string(),
  params: external_exports.optional(BaseParamsSchema)
});
var ServerCapabilitiesSchema = external_exports.object({
  experimental: external_exports.optional(external_exports.object({}).passthrough()),
  logging: external_exports.optional(external_exports.object({}).passthrough()),
  prompts: external_exports.optional(
    external_exports.object({
      listChanged: external_exports.optional(external_exports.boolean())
    }).passthrough()
  ),
  resources: external_exports.optional(
    external_exports.object({
      subscribe: external_exports.optional(external_exports.boolean()),
      listChanged: external_exports.optional(external_exports.boolean())
    }).passthrough()
  ),
  tools: external_exports.optional(
    external_exports.object({
      listChanged: external_exports.optional(external_exports.boolean())
    }).passthrough()
  )
}).passthrough();
var InitializeResultSchema = ResultSchema.extend({
  protocolVersion: external_exports.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ClientOrServerImplementationSchema,
  instructions: external_exports.optional(external_exports.string())
});
var PaginatedResultSchema = ResultSchema.extend({
  nextCursor: external_exports.optional(external_exports.string())
});
var ToolSchema = external_exports.object({
  name: external_exports.string(),
  description: external_exports.optional(external_exports.string()),
  inputSchema: external_exports.object({
    type: external_exports.literal("object"),
    properties: external_exports.optional(external_exports.object({}).passthrough())
  }).passthrough()
}).passthrough();
var ListToolsResultSchema = PaginatedResultSchema.extend({
  tools: external_exports.array(ToolSchema)
});
var TextContentSchema = external_exports.object({
  type: external_exports.literal("text"),
  text: external_exports.string()
}).passthrough();
var ImageContentSchema = external_exports.object({
  type: external_exports.literal("image"),
  data: external_exports.string().base64(),
  mimeType: external_exports.string()
}).passthrough();
var ResourceContentsSchema = external_exports.object({
  /**
   * The URI of this resource.
   */
  uri: external_exports.string(),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: external_exports.optional(external_exports.string())
}).passthrough();
var TextResourceContentsSchema = ResourceContentsSchema.extend({
  text: external_exports.string()
});
var BlobResourceContentsSchema = ResourceContentsSchema.extend({
  blob: external_exports.string().base64()
});
var EmbeddedResourceSchema = external_exports.object({
  type: external_exports.literal("resource"),
  resource: external_exports.union([TextResourceContentsSchema, BlobResourceContentsSchema])
}).passthrough();
var CallToolResultSchema = ResultSchema.extend({
  content: external_exports.array(
    external_exports.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema])
  ),
  isError: external_exports.boolean().default(false).optional()
}).or(
  ResultSchema.extend({
    toolResult: external_exports.unknown()
  })
);
var JSONRPC_VERSION = "2.0";
var JSONRPCRequestSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: external_exports.union([external_exports.string(), external_exports.number().int()])
}).merge(RequestSchema).strict();
var JSONRPCResponseSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: external_exports.union([external_exports.string(), external_exports.number().int()]),
  result: ResultSchema
}).strict();
var JSONRPCErrorSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: external_exports.union([external_exports.string(), external_exports.number().int()]),
  error: external_exports.object({
    code: external_exports.number().int(),
    message: external_exports.string(),
    data: external_exports.optional(external_exports.unknown())
  })
}).strict();
var JSONRPCNotificationSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION)
}).merge(
  external_exports.object({
    method: external_exports.string(),
    params: external_exports.optional(BaseParamsSchema)
  })
).strict();
var JSONRPCMessageSchema = external_exports.union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResponseSchema,
  JSONRPCErrorSchema
]);
var langchain_adapter_exports = {};
__export2(langchain_adapter_exports, {
  mergeIntoDataStream: () => mergeIntoDataStream,
  toDataStream: () => toDataStream,
  toDataStreamResponse: () => toDataStreamResponse
});
function createCallbacksTransformer(callbacks = {}) {
  const textEncoder = new TextEncoder();
  let aggregatedResponse = "";
  return new TransformStream({
    async start() {
      if (callbacks.onStart)
        await callbacks.onStart();
    },
    async transform(message, controller) {
      controller.enqueue(textEncoder.encode(message));
      aggregatedResponse += message;
      if (callbacks.onToken)
        await callbacks.onToken(message);
      if (callbacks.onText && typeof message === "string") {
        await callbacks.onText(message);
      }
    },
    async flush() {
      if (callbacks.onCompletion) {
        await callbacks.onCompletion(aggregatedResponse);
      }
      if (callbacks.onFinal) {
        await callbacks.onFinal(aggregatedResponse);
      }
    }
  });
}
function toDataStreamInternal(stream, callbacks) {
  return stream.pipeThrough(
    new TransformStream({
      transform: async (value, controller) => {
        var _a17;
        if (typeof value === "string") {
          controller.enqueue(value);
          return;
        }
        if ("event" in value) {
          if (value.event === "on_chat_model_stream") {
            forwardAIMessageChunk(
              (_a17 = value.data) == null ? void 0 : _a17.chunk,
              controller
            );
          }
          return;
        }
        forwardAIMessageChunk(value, controller);
      }
    })
  ).pipeThrough(createCallbacksTransformer(callbacks)).pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream({
      transform: async (chunk, controller) => {
        controller.enqueue(formatDataStreamPart("text", chunk));
      }
    })
  );
}
function toDataStream(stream, callbacks) {
  return toDataStreamInternal(stream, callbacks).pipeThrough(
    new TextEncoderStream()
  );
}
function toDataStreamResponse(stream, options) {
  var _a17;
  const dataStream = toDataStreamInternal(
    stream,
    options == null ? void 0 : options.callbacks
  ).pipeThrough(new TextEncoderStream());
  const data = options == null ? void 0 : options.data;
  const init = options == null ? void 0 : options.init;
  const responseStream = data ? mergeStreams(data.stream, dataStream) : dataStream;
  return new Response(responseStream, {
    status: (_a17 = init == null ? void 0 : init.status) != null ? _a17 : 200,
    statusText: init == null ? void 0 : init.statusText,
    headers: prepareResponseHeaders(init == null ? void 0 : init.headers, {
      contentType: "text/plain; charset=utf-8",
      dataStreamVersion: "v1"
    })
  });
}
function mergeIntoDataStream(stream, options) {
  options.dataStream.merge(toDataStreamInternal(stream, options.callbacks));
}
function forwardAIMessageChunk(chunk, controller) {
  if (typeof chunk.content === "string") {
    controller.enqueue(chunk.content);
  } else {
    const content = chunk.content;
    for (const item of content) {
      if (item.type === "text") {
        controller.enqueue(item.text);
      }
    }
  }
}
var llamaindex_adapter_exports = {};
__export2(llamaindex_adapter_exports, {
  mergeIntoDataStream: () => mergeIntoDataStream2,
  toDataStream: () => toDataStream2,
  toDataStreamResponse: () => toDataStreamResponse2
});
function toDataStreamInternal2(stream, callbacks) {
  const trimStart = trimStartOfStream();
  return convertAsyncIteratorToReadableStream(stream[Symbol.asyncIterator]()).pipeThrough(
    new TransformStream({
      async transform(message, controller) {
        controller.enqueue(trimStart(message.delta));
      }
    })
  ).pipeThrough(createCallbacksTransformer(callbacks)).pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream({
      transform: async (chunk, controller) => {
        controller.enqueue(formatDataStreamPart("text", chunk));
      }
    })
  );
}
function toDataStream2(stream, callbacks) {
  return toDataStreamInternal2(stream, callbacks).pipeThrough(
    new TextEncoderStream()
  );
}
function toDataStreamResponse2(stream, options = {}) {
  var _a17;
  const { init, data, callbacks } = options;
  const dataStream = toDataStreamInternal2(stream, callbacks).pipeThrough(
    new TextEncoderStream()
  );
  const responseStream = data ? mergeStreams(data.stream, dataStream) : dataStream;
  return new Response(responseStream, {
    status: (_a17 = init == null ? void 0 : init.status) != null ? _a17 : 200,
    statusText: init == null ? void 0 : init.statusText,
    headers: prepareResponseHeaders(init == null ? void 0 : init.headers, {
      contentType: "text/plain; charset=utf-8",
      dataStreamVersion: "v1"
    })
  });
}
function mergeIntoDataStream2(stream, options) {
  options.dataStream.merge(toDataStreamInternal2(stream, options.callbacks));
}
function trimStartOfStream() {
  let isStreamStart = true;
  return (text2) => {
    if (isStreamStart) {
      text2 = text2.trimStart();
      if (text2)
        isStreamStart = false;
    }
    return text2;
  };
}
var HANGING_STREAM_WARNING_TIME_MS = 15 * 1e3;

// pipeline_core/cost.ts
var PRICING = {
  // Anthropic
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // OpenAI
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  // Google
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
  // xAI
  "grok-2-latest": { in: 2, out: 10 }
};
var FALLBACK = { in: 3, out: 15 };
function costFor(model, inputTokens, outputTokens) {
  const p = PRICING[model] ?? FALLBACK;
  return inputTokens / 1e6 * p.in + outputTokens / 1e6 * p.out;
}
var CostMeter = class {
  inTokens = 0;
  outTokens = 0;
  spent = 0;
  callCount = 0;
  record(model, inputTokens, outputTokens) {
    const costUsd = costFor(model, inputTokens, outputTokens);
    this.inTokens += inputTokens;
    this.outTokens += outputTokens;
    this.spent += costUsd;
    this.callCount += 1;
    return { inputTokens, outputTokens, costUsd };
  }
  get spentUsd() {
    return this.spent;
  }
  get calls() {
    return this.callCount;
  }
  summary() {
    return {
      calls: this.callCount,
      inputTokens: this.inTokens,
      outputTokens: this.outTokens,
      spentUsd: Number(this.spent.toFixed(6))
    };
  }
};

// pipeline_core/providers.ts
var SUPPORTED_PROVIDERS = /* @__PURE__ */ new Set(["anthropic"]);
var DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  xai: "grok-2-latest"
};
var KEY_ENV10 = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  xai: ["XAI_API_KEY"]
};
function detectProvider() {
  const order = ["anthropic", "openai", "xai", "google"];
  for (const p of order) {
    if (KEY_ENV10[p].some((k) => hasSecret(k))) return p;
  }
  return "anthropic";
}
function assertSupported(provider) {
  if (SUPPORTED_PROVIDERS.has(provider)) return;
  if (process.env.INTENT_OUTREACH_ALLOW_UNGATED === "1") return;
  throw new Error(
    `provider "${provider}" has not passed the eval gate yet (D4: Claude-first). Run the eval harness to gate it, or set INTENT_OUTREACH_ALLOW_UNGATED=1 to override.`
  );
}
function firstKey(provider) {
  const name17 = KEY_ENV10[provider].find((k) => hasSecret(k)) ?? KEY_ENV10[provider][0];
  return getSecret(name17);
}
async function resolveModel(provider, modelId) {
  switch (provider) {
    case "anthropic": {
      const { createAnthropic: createAnthropic2 } = await Promise.resolve().then(() => (init_dist3(), dist_exports));
      const baseURL = process.env.ANTHROPIC_BASE_URL;
      return createAnthropic2({ apiKey: firstKey("anthropic"), ...baseURL ? { baseURL } : {} })(
        modelId
      );
    }
    case "openai": {
      const { createOpenAI: createOpenAI2 } = await Promise.resolve().then(() => (init_dist4(), dist_exports2));
      return createOpenAI2({ apiKey: firstKey("openai") })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI: createGoogleGenerativeAI2 } = await Promise.resolve().then(() => (init_dist5(), dist_exports3));
      return createGoogleGenerativeAI2({ apiKey: firstKey("google") })(modelId);
    }
    case "xai": {
      const { createXai: createXai2 } = await Promise.resolve().then(() => (init_dist7(), dist_exports4));
      return createXai2({ apiKey: firstKey("xai") })(modelId);
    }
  }
}
async function getProvider(opts = {}) {
  const name17 = opts.provider ?? detectProvider();
  assertSupported(name17);
  const model = opts.model ?? process.env.INTENT_OUTREACH_MODEL ?? DEFAULT_MODEL[name17];
  const languageModel = await resolveModel(name17, model);
  return {
    name: name17,
    model,
    async generateObject(args) {
      const res = await generateObject({
        model: languageModel,
        schema: args.schema,
        prompt: args.prompt,
        ...args.system ? { system: args.system } : {}
      });
      const u = res.usage;
      const inputTokens = u.promptTokens ?? 0;
      const outputTokens = u.completionTokens ?? 0;
      return {
        object: res.object,
        usage: { inputTokens, outputTokens, costUsd: costFor(model, inputTokens, outputTokens) }
      };
    }
  };
}
function listProviderStatus() {
  return Object.keys(KEY_ENV10).map((p) => ({
    name: p,
    configured: KEY_ENV10[p].some((k) => hasSecret(k)),
    supported: SUPPORTED_PROVIDERS.has(p),
    defaultModel: DEFAULT_MODEL[p],
    keyEnvVars: KEY_ENV10[p]
  }));
}

// pipeline_core/seam.ts
init_zod();

// pipeline_core/prompts.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
var cache = /* @__PURE__ */ new Map();
function candidatePaths(name17) {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = [];
  if (process.env.INTENT_OUTREACH_PROMPTS_DIR) {
    out.push(join2(process.env.INTENT_OUTREACH_PROMPTS_DIR, name17));
  }
  out.push(join2(here, "..", "prompts", name17));
  out.push(join2(process.cwd(), "prompts", name17));
  return out;
}
function loadPrompt(name17) {
  const cached = cache.get(name17);
  if (cached !== void 0) return cached;
  for (const path of candidatePaths(name17)) {
    try {
      const text2 = readFileSync2(path, "utf8");
      cache.set(name17, text2);
      return text2;
    } catch {
    }
  }
  throw new Error(`prompt not found: ${name17} (looked in: ${candidatePaths(name17).join(", ")})`);
}

// pipeline_core/seam.ts
var ScoreOutputSchema = external_exports.object({
  fitScore: external_exports.number().min(0).max(100),
  fitReason: external_exports.string(),
  angles: external_exports.array(external_exports.string()).max(3).default([])
});
var DraftOutputSchema = external_exports.object({
  subject: external_exports.string().optional(),
  body: external_exports.string().min(1),
  cta: external_exports.string().min(1)
});
function compact(value) {
  return JSON.stringify(value, null, 0);
}
async function scoreLead(provider, ctx) {
  const system = `${loadPrompt("research.v1.md")}

---

${loadPrompt("enrich.v1.md")}`;
  const prompt = [
    `ICP: ${ctx.icp}`,
    `LEAD: ${compact(ctx.lead)}`,
    `CONTACTS: ${compact(ctx.contacts)}`,
    `ENRICHMENT: ${compact(ctx.enrichments)}`
  ].join("\n");
  return provider.generateObject({ schema: ScoreOutputSchema, system, prompt });
}
async function draftMessage(provider, ctx) {
  const base = loadPrompt("outreach.v1.md");
  const system = ctx.styleOverride ? `${base}

## Profile overrides
${ctx.styleOverride}` : base;
  const prompt = [
    `ICP/OFFER: ${ctx.icp}`,
    `CHANNEL: ${ctx.channel}`,
    `LEAD: ${compact(ctx.lead)}`,
    `CONTACT: ${compact(ctx.contact)}`,
    `ANGLES: ${compact(ctx.angles)}`
  ].join("\n");
  return provider.generateObject({ schema: DraftOutputSchema, system, prompt });
}

// pipeline_core/pipeline.ts
function dedupeLeads(leads) {
  const byDomain = /* @__PURE__ */ new Map();
  for (const lead of leads) {
    const existing = byDomain.get(lead.domain);
    if (!existing) {
      byDomain.set(lead.domain, { ...lead });
    } else {
      byDomain.set(lead.domain, {
        ...existing,
        companyName: existing.companyName || lead.companyName,
        industry: existing.industry ?? lead.industry,
        size: existing.size ?? lead.size,
        description: existing.description ?? lead.description
      });
    }
  }
  return [...byDomain.values()];
}
function dedupeContacts(contacts) {
  const byKey = /* @__PURE__ */ new Map();
  for (const c of contacts) {
    const key = c.email ?? `${c.name.toLowerCase()}@${c.leadDomain}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c });
    } else {
      byKey.set(key, {
        ...existing,
        email: existing.email ?? c.email,
        title: existing.title ?? c.title,
        linkedin: existing.linkedin ?? c.linkedin
      });
    }
  }
  return [...byKey.values()];
}
async function runResearch(domain, icp) {
  registerBuiltinConnectors();
  const connectors = getConfiguredConnectors("research");
  const leads = [];
  const contacts = [];
  const raw = {};
  const ran = [];
  const skipped = getSkippedConnectors("research").map((c) => c.name);
  for (const connector of connectors) {
    if (!connector.research) continue;
    try {
      const out = await connector.research({ domain, icp });
      leads.push(...out.leads);
      contacts.push(...out.contacts);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
    } catch (err) {
      raw[connector.name] = {
        failed: true,
        status: err instanceof HttpError ? err.status : "error"
      };
      skipped.push(connector.name);
    }
  }
  return { leads: dedupeLeads(leads), contacts: dedupeContacts(contacts), ran, skipped, raw };
}
async function runEnrich(lead, contacts) {
  registerBuiltinConnectors();
  const connectors = getConfiguredConnectors("enrich");
  const enrichments = [];
  const raw = {};
  const ran = [];
  const skipped = getSkippedConnectors("enrich").map((c) => c.name);
  for (const connector of connectors) {
    if (!connector.enrich) continue;
    try {
      const out = await connector.enrich({ lead, contacts });
      enrichments.push(...out.enrichments);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
    } catch (err) {
      raw[connector.name] = {
        failed: true,
        status: err instanceof HttpError ? err.status : "error"
      };
      skipped.push(connector.name);
    }
  }
  return { enrichments, ran, skipped, raw };
}
async function runCampaign(input) {
  const { icp, domains } = input;
  const now = input.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const channel = input.channel ?? "email";
  const minScore = input.minScore ?? 0;
  const maxContacts = input.maxContactsPerLead ?? 1;
  const provider = input.provider ?? await getProvider();
  const meter = new CostMeter();
  const createdAt = now();
  const allLeads = [];
  const allContacts = [];
  const allEnrichments = [];
  const messages = [];
  const skipped = /* @__PURE__ */ new Set();
  let anyResearchRan = false;
  for (const domain of domains) {
    const research = await runResearch(domain, icp);
    research.skipped.forEach((s) => skipped.add(s));
    if (research.ran.length > 0) anyResearchRan = true;
    for (const lead of research.leads) {
      const leadContacts = research.contacts.filter((c) => c.leadDomain === lead.domain);
      const enrich = await runEnrich(lead, leadContacts);
      enrich.skipped.forEach((s) => skipped.add(s));
      allLeads.push(lead);
      allContacts.push(...leadContacts);
      allEnrichments.push(...enrich.enrichments);
      const scored = await scoreLead(provider, {
        icp,
        lead,
        contacts: leadContacts,
        enrichments: enrich.enrichments
      });
      meter.record(provider.model, scored.usage.inputTokens, scored.usage.outputTokens);
      if (scored.object.fitScore < minScore) continue;
      for (const contact of leadContacts.slice(0, maxContacts)) {
        const drafted = await draftMessage(provider, {
          icp,
          lead,
          contact,
          angles: scored.object.angles,
          channel,
          ...input.styleOverride ? { styleOverride: input.styleOverride } : {}
        });
        meter.record(provider.model, drafted.usage.inputTokens, drafted.usage.outputTokens);
        const candidate = {
          contactKey: contact.email ?? `${contact.name}@${lead.domain}`,
          channel,
          subject: drafted.object.subject,
          body: drafted.object.body,
          cta: drafted.object.cta,
          fitScore: scored.object.fitScore,
          model: provider.model,
          promptVersion: "outreach.v1",
          createdAt: now()
        };
        const validated = validateMessage(candidate);
        if (validated.ok) messages.push(validated.value);
      }
    }
  }
  const status = messages.length ? "complete" : allLeads.length ? "enriched" : anyResearchRan ? "researched" : "failed";
  const run = assertCampaignRun({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    icp,
    domains,
    provider: provider.name,
    model: provider.model,
    status,
    leads: dedupeLeads(allLeads),
    contacts: dedupeContacts(allContacts),
    enrichments: allEnrichments,
    messages,
    costUsd: meter.summary().spentUsd,
    skippedConnectors: [...skipped],
    createdAt,
    finishedAt: now()
  });
  return { run, cost: meter.summary() };
}

// pipeline_core/store.ts
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname as dirname2, join as join3 } from "node:path";
import { homedir as homedir2 } from "node:os";
function defaultStorePath() {
  const base = process.env.INTENT_OUTREACH_HOME ?? join3(homedir2(), ".intent-outreach");
  return join3(base, "runs.jsonl");
}
var JsonlRunStore = class {
  constructor(path = defaultStorePath()) {
    this.path = path;
  }
  path;
  async saveRun(run) {
    await mkdir(dirname2(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(run) + "\n", "utf8");
  }
  async getRun(id) {
    const lines = await this.readLines();
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line === void 0) continue;
      const parsed = this.tryParseLine(line);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }
  async listRunIds() {
    const lines = await this.readLines();
    const ids = /* @__PURE__ */ new Set();
    for (const line of lines) {
      const parsed = this.tryParseLine(line);
      if (parsed) ids.add(parsed.id);
    }
    return [...ids];
  }
  async readLines() {
    try {
      const text2 = await readFile(this.path, "utf8");
      return text2.split("\n").filter((l) => l.trim().length > 0);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }
  /** Re-validate on read so a hand-edited/corrupt line can never poison a result. */
  tryParseLine(line) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    const r = validateCampaignRun(raw);
    return r.ok ? r.value : null;
  }
};

// cli.ts
function makeRunId() {
  return `run-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
}
function printHelp() {
  process.stdout.write(
    [
      "intent-outreach \u2014 model-agnostic SDR orchestrator (local, BYO keys)",
      "",
      "Usage:",
      "  intent-outreach run --icp <text> --domains <a.com,b.com> [options]",
      "  intent-outreach connectors          list connectors + whether each is configured",
      "  intent-outreach providers           list model providers + gate status",
      "  intent-outreach help",
      "",
      "run options:",
      "  --icp <text>            (required) ideal customer profile / offer",
      "  --domains <list>        (required) comma-separated company domains",
      "  --provider <name>       anthropic | openai | google | xai (default: auto-detect)",
      "  --model <id>            override the model id",
      "  --channel <email|linkedin>   default: email",
      "  --min-score <0-100>     skip drafting below this fit score (default: 0)",
      "  --max-contacts <n>      contacts to draft per lead (default: 1)",
      "  --out <path>            JSONL store path (default: " + defaultStorePath() + ")",
      "  --json                  print the full run as JSON",
      "",
      "Keys are read from your environment or a local secrets file \u2014 never the cloud."
    ].join("\n") + "\n"
  );
}
async function cmdConnectors() {
  registerBuiltinConnectors();
  for (const c of getConnectors()) {
    const mark = c.isConfigured() ? "\u2713" : "\xB7";
    process.stdout.write(
      `${mark} ${c.name.padEnd(16)} ${c.tier.padEnd(11)} ${c.phases.join("+").padEnd(16)} ${c.isConfigured() ? "configured" : `set ${c.keyEnvVar ?? "(no key)"}`}
`
    );
  }
}
function cmdProviders() {
  for (const p of listProviderStatus()) {
    const mark = p.configured ? "\u2713" : "\xB7";
    const gate2 = p.supported ? "supported" : "ungated (run evals)";
    process.stdout.write(
      `${mark} ${p.name.padEnd(10)} ${gate2.padEnd(20)} default=${p.defaultModel.padEnd(20)} keys=${p.keyEnvVars.join("|")}
`
    );
  }
  process.stdout.write(`
auto-detected provider: ${detectProvider()}
`);
}
async function cmdRun(args) {
  const { values } = parseArgs({
    args,
    options: {
      icp: { type: "string" },
      domains: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      channel: { type: "string" },
      "min-score": { type: "string" },
      "max-contacts": { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" }
    },
    allowPositionals: false
  });
  if (!values.icp || !values.domains) {
    process.stderr.write("error: --icp and --domains are required\n\n");
    printHelp();
    process.exit(2);
  }
  const domains = values.domains.split(",").map((d) => d.trim()).filter(Boolean);
  const channel = values.channel === "linkedin" ? "linkedin" : "email";
  const provider = values.provider || values.model ? await getProvider({
    ...values.provider ? { provider: values.provider } : {},
    ...values.model ? { model: values.model } : {}
  }) : void 0;
  const { run, cost } = await runCampaign({
    id: makeRunId(),
    icp: values.icp,
    domains,
    channel,
    ...provider ? { provider } : {},
    ...values["min-score"] ? { minScore: Number(values["min-score"]) } : {},
    ...values["max-contacts"] ? { maxContactsPerLead: Number(values["max-contacts"]) } : {}
  });
  const store = new JsonlRunStore(values.out);
  await store.saveRun(run);
  if (values.json) {
    process.stdout.write(JSON.stringify(run, null, 2) + "\n");
  } else {
    process.stdout.write(
      [
        `run ${run.id} \u2014 ${run.status}`,
        `provider: ${run.provider} (${run.model})`,
        `leads: ${run.leads.length}  contacts: ${run.contacts.length}  messages: ${run.messages.length}`,
        run.skippedConnectors.length ? `skipped connectors: ${run.skippedConnectors.join(", ")}` : "",
        `cost: $${cost.spentUsd.toFixed(4)} over ${cost.calls} model calls`,
        `saved \u2192 ${values.out ?? defaultStorePath()}`
      ].filter(Boolean).join("\n") + "\n"
    );
  }
}
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "run":
      return cmdRun(rest);
    case "connectors":
      return cmdConnectors();
    case "providers":
      return void cmdProviders();
    case "help":
    case "--help":
    case "-h":
    case void 0:
      return void printHelp();
    default:
      process.stderr.write(`unknown command: ${cmd}

`);
      printHelp();
      process.exit(2);
  }
}
main().catch((err) => {
  process.stderr.write(`intent-outreach: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
