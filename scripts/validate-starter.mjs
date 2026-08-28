#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function requireFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) fail(`Missing file: ${relativePath}`);
  return absolutePath;
}

function readJson(relativePath) {
  const absolutePath = requireFile(relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolutePath));
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

const numberedDocuments = [
  "00_MASTER_README.md",
  "01_LEGACY_AUDIT_AND_GAP_ANALYSIS.md",
  "02_PRODUCT_BRIEF.md",
  "02A_MARKETING_EVIDENCE_REGISTER.md",
  "03_PRODUCT_PRINCIPLES_AND_SCOPE.md",
  "04_USER_RESEARCH_PERSONAS_JTBD.md",
  "05_PRODUCT_CATALOG_AND_ENTITLEMENT.md",
  "05A_LEGACY_PRODUCT_PROMISE_REGISTER.md",
  "06_USER_JOURNEYS.md",
  "07_INFORMATION_ARCHITECTURE_AND_SITEMAP.md",
  "08_USER_FLOWS_AND_EDGE_CASES.md",
  "09_UX_SPECIFICATION.md",
  "10_UI_DESIGN_BRIEF.md",
  "11_DESIGN_SYSTEM.md",
  "12_SCREEN_SPECIFICATIONS.md",
  "13_PRD.md",
  "14_PROGRAM_LMS_LIVE_CLASS_SPEC.md",
  "15_ADMIN_CMS_AND_QUESTION_BANK_SPEC.md",
  "15A_QUESTION_IMPORT_TEMPLATE_CONTRACT.md",
  "16_EXAM_ENGINE_CORE_CONTRACT.md",
  "17_EXAM_BLUEPRINTS_AND_SCORING.md",
  "18_FLASH_SALE_AND_BATCH_SYSTEM.md",
  "19_ANALYTICS_HABIT_AND_NOTIFICATION.md",
  "20_TECHNICAL_ARCHITECTURE.md",
  "21_ERD_AND_DATA_DICTIONARY.md",
  "22_API_AND_WEBHOOK_CONTRACT.md",
  "23_SEJOLI_WORDPRESS_INTEGRATION.md",
  "24_AUTH_RBAC_SECURITY_AND_PRIVACY.md",
  "25_MIGRATION_AND_RECONCILIATION_PLAN.md",
  "26_ADRS.md",
  "27_QA_TESTING_AND_UAT_PLAN.md",
  "28_IMPLEMENTATION_ROADMAP.md",
  "29_CLAUDE_CODE_EXECUTION_PLAN.md",
  "30_LAUNCH_AND_OPERATIONS_RUNBOOK.md"
];

const requiredFiles = [
  "README.md",
  "START_HERE.md",
  "PROMPT_PERTAMA_CLAUDE.md",
  "STARTER_VALIDATION.md",
  "CLAUDE.md",
  ".env.example",
  ".gitignore",
  "docs/gates/GATE_4_READINESS_REGISTER.md",
  "docs/gates/GATE_4_VALIDATION_REPORT.md",
  "docs/audit/RC2_AUDIT_CLOSURE_REPORT.md",
  "docs/source/01-Instruksi-superlatif.txt",
  "docs/source/02-Deck-Compro-Superlatif-Mar-2026-.pdf",
  "contracts/openapi.yaml",
  "contracts/drizzle-schema.ts",
  "contracts/exam-blueprint.schema.json",
  "contracts/entitlement-policy.schema.json",
  "contracts/question-import-template.xlsx",
  "contracts/question-import-advanced-template.xlsx",
  "contracts/question-import-example.zip",
  "contracts/analytics-event-catalog.json",
  "planning/implementation-backlog.json",
  "planning/release-gates.json",
  "test/fixtures/contracts/README.md",
  ".claude/skills/superlatif-domain/SKILL.md",
  ".claude/skills/superlatif-design-system/SKILL.md",
  ".claude/skills/superlatif-exam-engine/SKILL.md",
  ".claude/skills/superlatif-sejoli-sync/SKILL.md"
];

for (const document of numberedDocuments) requireFile(`docs/gates/${document}`);
for (const file of requiredFiles) requireFile(file);

const jsonFiles = [
  ...walk(path.join(root, "contracts")),
  ...walk(path.join(root, "planning")),
  ...walk(path.join(root, "test", "fixtures", "contracts"))
].filter((file) => file.endsWith(".json"));

for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${path.relative(root, file)}: ${error.message}`);
  }
}

const prdPath = requireFile("docs/gates/13_PRD.md");
const prdRequirements = [...new Set(fs.readFileSync(prdPath, "utf8").match(/\b(?:ADM|ANL|ATM|COM|ENT|EXM|IDN|LRN|NTF|PRG|QST|SCH|SCR)-\d{3}\b/g) ?? [])].sort();
const backlog = readJson("planning/implementation-backlog.json");
const tasks = backlog?.tasks ?? [];
const taskIds = tasks.map((task) => task.id);
const taskIdSet = new Set(taskIds);
const allFiles = walk(root);
const basenameIndex = new Set(allFiles.map((file) => path.basename(file)));
if (tasks.length === 0) fail("Backlog contains no tasks");
if (taskIdSet.size !== taskIds.length) fail("Backlog task IDs are not unique");

const requirementOwners = new Map();
for (const task of tasks) {
  if (!Array.isArray(task.dependsOn)) fail(`${task.id} has invalid dependsOn`);
  if (!Array.isArray(task.acceptance) || task.acceptance.length === 0) fail(`${task.id} lacks acceptance criteria`);
  if (!Array.isArray(task.tests) || task.tests.length === 0) fail(`${task.id} lacks test intent`);
  for (const dependency of task.dependsOn ?? []) {
    if (!taskIdSet.has(dependency)) fail(`${task.id} depends on unknown task ${dependency}`);
  }
  for (const readItem of task.readSet ?? []) {
    const resolved = readItem.includes("/")
      ? fs.existsSync(path.join(root, readItem))
      : basenameIndex.has(readItem);
    if (!resolved) fail(`${task.id} read-set item not found: ${readItem}`);
  }
  for (const requirementId of task.requirementIds ?? []) {
    const owners = requirementOwners.get(requirementId) ?? [];
    owners.push(task.id);
    requirementOwners.set(requirementId, owners);
  }
}

const coveredRequirements = [...requirementOwners.keys()].sort();
if (JSON.stringify(prdRequirements) !== JSON.stringify(coveredRequirements)) fail("Backlog requirement coverage does not equal PRD requirement inventory");
for (const [requirementId, owners] of requirementOwners) {
  if (owners.length !== 1) fail(`${requirementId} must have exactly one backlog owner; found ${owners.join(", ")}`);
}

const visiting = new Set();
const visited = new Set();
function visit(taskId, stack = []) {
  if (visited.has(taskId)) return;
  if (visiting.has(taskId)) {
    fail(`Dependency cycle: ${[...stack, taskId].join(" -> ")}`);
    return;
  }
  visiting.add(taskId);
  const task = tasks.find((candidate) => candidate.id === taskId);
  for (const dependency of task?.dependsOn ?? []) visit(dependency, [...stack, taskId]);
  visiting.delete(taskId);
  visited.add(taskId);
}
for (const taskId of taskIds) visit(taskId);

const fixtureFiles = walk(path.join(root, "test", "fixtures", "contracts")).filter((file) => file.endsWith(".json"));
let fixtureCases = 0;
for (const file of fixtureFiles) {
  const fixture = JSON.parse(fs.readFileSync(file, "utf8"));
  if (fixture.evidenceClass !== "synthetic") fail(`${path.basename(file)} is not marked synthetic`);
  if (fixture.productionEligible !== false) fail(`${path.basename(file)} must set productionEligible=false`);
  if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) fail(`${path.basename(file)} contains no cases`);
  fixtureCases += fixture.cases?.length ?? 0;
}

const releaseGates = readJson("planning/release-gates.json");
const expectedGateNames = { A: "Access", B: "Learning", C: "SKD", D: "Commerce/Launch" };
for (const gate of releaseGates?.gates ?? []) {
  if (gate.name !== expectedGateNames[gate.id]) fail(`Gate ${gate.id} has non-canonical name ${gate.name}`);
  if (gate.status === "PASS") fail(`Gate ${gate.id} is pre-marked PASS`);
}
for (const gate of releaseGates?.externalGates ?? []) {
  if (gate.status === "PASS") fail(`External gate ${gate.id} is pre-marked PASS`);
}

const envText = fs.readFileSync(requireFile(".env.example"), "utf8");
for (const flag of ["FEATURE_COMMERCE_SYNC", "FEATURE_EXAM_ENGINE", "SKD_PRODUCTION_ACTIVATION", "PRODUCTION_WRITES_ENABLED"]) {
  if (!envText.includes(`${flag}=false`)) fail(`${flag} must default to false`);
}

for (const skillName of ["superlatif-domain", "superlatif-design-system", "superlatif-exam-engine", "superlatif-sejoli-sync"]) {
  const skillText = fs.readFileSync(requireFile(`.claude/skills/${skillName}/SKILL.md`), "utf8");
  if (!skillText.startsWith("---\n")) fail(`${skillName} lacks YAML frontmatter`);
  if (!skillText.includes(`name: ${skillName}`)) fail(`${skillName} has incorrect name`);
  if (!/\ndescription:\s+\S/.test(skillText)) fail(`${skillName} lacks description`);
}

const claudeText = fs.readFileSync(requireFile("CLAUDE.md"), "utf8");
for (const pathReference of ["docs/gates/", "contracts/", "planning/", "test/fixtures/contracts/"]) {
  if (!claudeText.includes(pathReference)) fail(`CLAUDE.md does not reference ${pathReference}`);
}
if (Buffer.byteLength(claudeText, "utf8") > 25000) fail("CLAUDE.md exceeds the starter context budget of 25 KB");

const sourceDeck = requireFile("docs/source/02-Deck-Compro-Superlatif-Mar-2026-.pdf");
if (fs.existsSync(sourceDeck) && fs.statSync(sourceDeck).size < 100000) fail("Source brand deck appears incomplete");

const result = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  root,
  checks: {
    numberedDocuments: numberedDocuments.length,
    requiredFiles: requiredFiles.length,
    jsonFiles: jsonFiles.length,
    backlogTasks: tasks.length,
    prdRequirements: prdRequirements.length,
    fixtureSets: fixtureFiles.length,
    fixtureCases,
    projectSkills: 4
  },
  errors
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = errors.length === 0 ? 0 : 1;
