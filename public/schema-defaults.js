(function (root, factory) {
  var api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.SchemaDefaults = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function createDefaultValueFromField(fieldDef) {
    if (!fieldDef || typeof fieldDef !== "object") {
      return "";
    }

    if (fieldDef.type === "array") {
      return [];
    }

    if (fieldDef.type === "object") {
      return createDefaultObjectFromFields(fieldDef.fields || []);
    }

    if (fieldDef.type === "select") {
      if (fieldDef.optional) {
        return "";
      }
      return Array.isArray(fieldDef.options) && fieldDef.options.length
        ? fieldDef.options[0]
        : "";
    }

    if (fieldDef.type === "number") {
      return null;
    }

    return "";
  }

  function createDefaultObjectFromFields(fields) {
    var result = {};

    (fields || []).forEach(function (fieldDef) {
      if (!fieldDef || !fieldDef.key) {
        return;
      }
      result[fieldDef.key] = createDefaultValueFromField(fieldDef);
    });

    return result;
  }

  function createDefaultBlock(blockType, schema) {
    return Object.assign(
      { type: blockType },
      createDefaultObjectFromFields(schema && Array.isArray(schema.fields) ? schema.fields : [])
    );
  }

  return {
    createDefaultValueFromField: createDefaultValueFromField,
    createDefaultObjectFromFields: createDefaultObjectFromFields,
    createDefaultBlock: createDefaultBlock,
  };
});
