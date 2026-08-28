#!/usr/bin/env node

/**
 * Contract validation (GOV-002).
 *
 * Closes the gap left by scripts/validate-starter.mjs, which proves the
 * contract files exist and parse but never proves they are internally
 * consistent. Implements the contract checks required by
 * 27_QA_TESTING_AND_UAT_PLAN.md §7 and 22_API_AND_WEBHOOK_CONTRACT.md §23:
 *
 *   1. OpenAPI parses and declares a version;
 *   2. every local $ref resolves, and no external $ref is introduced silently;
 *   3. every path template variable is a declared path parameter, and every
 *      declared path parameter appears in the template;
 *   4. examples leak no exam secret or credential;
 *   5. every JSON Schema compiles under its declared draft.
 *
 * Usage:
 *   node scripts/validate-contracts.mjs
 *   node scripts/validate-contracts.mjs --openapi <path> --schema <path> ...
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (message) => errors.push(message);

function parseArguments(argv) {
  const options = { openapi: path.join(root, "contracts/openapi.yaml"), schemas: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--openapi" && value) {
      options.openapi = path.resolve(value);
      index += 1;
    } else if (flag === "--schema" && value) {
      options.schemas.push(path.resolve(value));
      index += 1;
    } else {
      fail(`Unknown argument: ${flag}`);
    }
  }
  if (options.schemas.length === 0) {
    options.schemas = [
      path.join(root, "contracts/exam-blueprint.schema.json"),
      path.join(root, "contracts/entitlement-policy.schema.json"),
    ];
  }
  return options;
}

/**
 * Keys that must never appear in a contract example. Exam answer keys and
 * option weights are server-only secrets (ADR-021, ADR-039); credentials and
 * raw provider payloads are forbidden by 24_AUTH_RBAC_SECURITY_AND_PRIVACY.md
 * §17. Ordinary PII field names such as "email" are deliberately excluded:
 * the API legitimately models them, and flagging them would train reviewers to
 * ignore this check.
 */
const FORBIDDEN_EXAMPLE_KEYS = new Set(
  [
    "answer_key",
    "answerKey",
    "correct_answer",
    "correctAnswer",
    "correct_option",
    "correctOption",
    "option_weight",
    "optionWeight",
    "option_weights",
    "optionWeights",
    "password",
    "otp",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "session_cookie",
    "sessionCookie",
    "raw_webhook_payload",
    "rawWebhookPayload",
    "payment_payload",
    "paymentPayload",
    "private_meeting_url",
    "privateMeetingUrl",
  ].map((key) => key.toLowerCase()),
);

function walkNodes(node, visit, pointer = "#") {
  visit(node, pointer);
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walkNodes(entry, visit, `${pointer}/${index}`));
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      walkNodes(value, visit, `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`);
    }
  }
}

function resolvePointer(document, ref) {
  const segments = ref.slice(2).split("/");
  let current = document;
  for (const rawSegment of segments) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function checkOpenApi(openapiPath) {
  if (!fs.existsSync(openapiPath)) {
    fail(`OpenAPI document not found: ${path.relative(root, openapiPath)}`);
    return null;
  }
  let document;
  try {
    document = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
  } catch (error) {
    fail(`OpenAPI does not parse: ${error.message}`);
    return null;
  }
  if (document === null || typeof document !== "object") {
    fail("OpenAPI root is not an object");
    return null;
  }
  if (typeof document.openapi !== "string") {
    fail("OpenAPI document declares no `openapi` version");
  }

  // 2. reference integrity
  let refCount = 0;
  walkNodes(document, (node, pointer) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return;
    const ref = node.$ref;
    if (typeof ref !== "string") return;
    refCount += 1;
    if (!ref.startsWith("#/")) {
      fail(`External or unsupported $ref at ${pointer}: ${ref}`);
      return;
    }
    if (resolvePointer(document, ref) === undefined) {
      fail(`Unresolved $ref at ${pointer}: ${ref}`);
    }
  });

  // 3. path template variables versus declared path parameters
  const paths = document.paths ?? {};
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  let pathCount = 0;
  for (const [route, pathItem] of Object.entries(paths)) {
    if (pathItem === null || typeof pathItem !== "object") continue;
    pathCount += 1;
    const templated = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

    const collect = (parameters) =>
      (parameters ?? [])
        .map((parameter) =>
          parameter !== null && typeof parameter === "object" && typeof parameter.$ref === "string"
            ? resolvePointer(document, parameter.$ref)
            : parameter,
        )
        .filter((parameter) => parameter !== null && typeof parameter === "object");

    const shared = collect(pathItem.parameters);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method) || operation === null || typeof operation !== "object") continue;
      const declared = [...shared, ...collect(operation.parameters)]
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);

      for (const variable of templated) {
        if (!declared.includes(variable)) {
          fail(`${method.toUpperCase()} ${route} uses {${variable}} but declares no matching path parameter`);
        }
      }
      for (const name of declared) {
        if (!templated.includes(name)) {
          fail(
            `${method.toUpperCase()} ${route} declares path parameter "${name}" that the template never uses`,
          );
        }
      }
    }
  }

  // 4. examples must not carry exam secrets or credentials
  let exampleCount = 0;
  walkNodes(document, (node, pointer) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return;
    const candidates = [];
    if ("example" in node) candidates.push([`${pointer}/example`, node.example]);
    if (node.examples !== null && typeof node.examples === "object" && !Array.isArray(node.examples)) {
      for (const [name, wrapper] of Object.entries(node.examples)) {
        if (wrapper !== null && typeof wrapper === "object" && "value" in wrapper) {
          candidates.push([`${pointer}/examples/${name}`, wrapper.value]);
        }
      }
    }
    for (const [where, value] of candidates) {
      exampleCount += 1;
      walkNodes(value, (inner) => {
        if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return;
        for (const key of Object.keys(inner)) {
          if (FORBIDDEN_EXAMPLE_KEYS.has(key.toLowerCase())) {
            fail(`Example at ${where} exposes forbidden key "${key}"`);
          }
        }
      });
    }
  });

  return { refCount, pathCount, exampleCount, version: document.openapi };
}

function checkJsonSchemas(schemaPaths) {
  const ajv = new Ajv2020.default({ strict: false, allErrors: true, validateFormats: true });
  addFormats.default(ajv);
  const compiled = [];
  for (const schemaPath of schemaPaths) {
    const rel = path.relative(root, schemaPath);
    if (!fs.existsSync(schemaPath)) {
      fail(`JSON Schema not found: ${rel}`);
      continue;
    }
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    } catch (error) {
      fail(`JSON Schema does not parse (${rel}): ${error.message}`);
      continue;
    }
    try {
      ajv.compile(schema);
      compiled.push({ file: rel, id: schema.$id ?? null, draft: schema.$schema ?? null });
    } catch (error) {
      fail(`JSON Schema does not compile (${rel}): ${error.message}`);
    }
  }
  return compiled;
}

const options = parseArguments(process.argv.slice(2));
const openapi = checkOpenApi(options.openapi);
const schemas = checkJsonSchemas(options.schemas);

const result = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  openapi: openapi
    ? {
        file: path.relative(root, options.openapi),
        version: openapi.version,
        paths: openapi.pathCount,
        refs: openapi.refCount,
        examples: openapi.exampleCount,
      }
    : null,
  schemas,
  errors,
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = errors.length === 0 ? 0 : 1;
