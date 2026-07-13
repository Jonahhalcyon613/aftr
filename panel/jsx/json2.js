// json2.js — JSON polyfill for ExtendScript (ES3).
// Simplified from Douglas Crockford's json2.js. Only provides JSON.stringify
// and JSON.parse for the AE scripting engine which may lack native JSON.
// This file is concatenated into the JSX bundle before any command code.

if (typeof JSON !== "object") {
  JSON = {};
}

(function () {
  "use strict";

  var rx_escapable = /[\\\"\x00-\x1f\x7f-\x9f]/g;
  var meta = {
    "\b": "\\b",
    "\t": "\\t",
    "\n": "\\n",
    "\f": "\\f",
    "\r": "\\r",
    "\"": "\\\"",
    "\\": "\\\\"
  };

  function quote(string) {
    rx_escapable.lastIndex = 0;
    return rx_escapable.test(string)
      ? "\"" + string.replace(rx_escapable, function (a) {
          var c = meta[a];
          return typeof c === "string"
            ? c
            : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
        }) + "\""
      : "\"" + string + "\"";
  }

  function str(key, holder) {
    var value = holder[key];
    var i, partial, v;

    if (value !== null && typeof value === "object" &&
        typeof value.toJSON === "function") {
      value = value.toJSON(key);
    }

    switch (typeof value) {
      case "string":
        return quote(value);
      case "number":
        return isFinite(value) ? String(value) : "null";
      case "boolean":
      case "null":
        return String(value);
      case "object":
        if (!value) {
          return "null";
        }
        partial = [];
        if (Object.prototype.toString.apply(value) === "[object Array]") {
          for (i = 0; i < value.length; i += 1) {
            partial[i] = str(i, value) || "null";
          }
          v = partial.length === 0 ? "[]" : "[" + partial.join(",") + "]";
          return v;
        }
        for (var k in value) {
          if (Object.prototype.hasOwnProperty.call(value, k)) {
            v = str(k, value);
            if (v) {
              partial.push(quote(k) + ":" + v);
            }
          }
        }
        v = partial.length === 0 ? "{}" : "{" + partial.join(",") + "}";
        return v;
    }
  }

  if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value) {
      return str("", { "": value });
    };
  }

  if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
      // Use eval — this is ExtendScript, not a browser security context.
      // The text comes from our own controller, not user input.
      return eval("(" + text + ")");
    };
  }
}());
