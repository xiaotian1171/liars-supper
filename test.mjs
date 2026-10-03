/* Logic tests for Liar's Supper — the parts that break quietly: dealing the
 * right number of liars to every table size, and refusing a host-written
 * scenario that does not fit the table it was asked for.
 *
 * Run: node test.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.location = { origin: "https://example.test", pathname: "/", search: "", href: "" };
globalThis.document = {};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const dir = mkdtempSync(join(tmpdir(), "liars-supper-"));

const packPath = join(dir, "pack.mjs");
writeFileSync(packPath, readFileSync(join(here, "pack.js"), "utf8"));
await import(pathToFileURL(packPath).href);

const appPath = join(dir, "app.mjs");
const source = readFileSync(join(here, "app.js"), "utf8").replace(/if \(typeof document[\s\S]*$/, "");
writeFileSync(
    appPath,
    `${source}
export { liarCount, shuffle, assignRoles, validateScenario, cleanJson, tallyVotes, verdictOf, clockText, scenarioFromPack };
`,
);
const app = await import(pathToFileURL(appPath).href);

let passed = 0;
const failures = [];

function ok(name, condition) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(name);
}

function eq(name, actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    ok(a === b ? name : `${name} — got ${a}, wanted ${b}`, a === b);
}

/* ------------------------------------------------------------ how many liars */

eq("4 players hide one liar", app.liarCount(4), 1);
eq("6 players hide one liar", app.liarCount(6), 1);
eq("7 players hide two liars", app.liarCount(7), 2);
eq("9 players hide two liars", app.liarCount(9), 2);
eq("10 players hide three liars", app.liarCount(10), 3);
eq("12 players hide three liars", app.liarCount(12), 3);

/* -------------------------------------------------------------- the shuffling */

const input = [1, 2, 3, 4, 5, 6, 7, 8];
const shuffled = app.shuffle(input);
eq("shuffling keeps every item", shuffled.slice().sort((a, b) => a - b), input);
eq("shuffling leaves the original alone", input, [1, 2, 3, 4, 5, 6, 7, 8]);
eq("shuffling keeps the length", shuffled.length, input.length);

/* ------------------------------------------------------------ the starter pack */

eq("the starter pack holds three scenarios", globalThis.LIARS_PACK.length, 3);

for (const scenario of globalThis.LIARS_PACK) {
    const everyone = [...scenario.liars, ...scenario.table];
    eq(`"${scenario.title}" has three liar roles`, scenario.liars.length, 3);
    eq(`"${scenario.title}" has six table roles`, scenario.table.length, 6);
    eq(`"${scenario.title}" has three twists`, scenario.twists.length, 3);
    ok(`"${scenario.title}" gives every role a name, objective and secret`, everyone.every((role) => role.name && role.objective && role.secret));
    ok(`"${scenario.title}" never reuses a role name`, new Set(everyone.map((role) => role.name)).size === everyone.length);
    ok(`"${scenario.title}" opens and closes with a line for the host`, Boolean(scenario.premise && scenario.closing));
}

ok("there are enough fillers for the biggest table", globalThis.LIARS_FILLERS.length >= 3);
ok("no filler repeats a name in the pack", !globalThis.LIARS_FILLERS.some((filler) => globalThis.LIARS_PACK.some((s) => [...s.liars, ...s.table].some((role) => role.name === filler.name))));

/* ----------------------------------------------------------------- the dealing */

for (let players = 4; players <= 12; players += 1) {
    for (const scenario of globalThis.LIARS_PACK) {
        const dealt = app.assignRoles(scenario, players);
        eq(`dealing ${players} roles from "${scenario.title}"`, dealt.length, players);
        eq(`hiding ${app.liarCount(players)} liars among ${players} from "${scenario.title}"`, dealt.filter((role) => role.team === "liar").length, app.liarCount(players));
        ok(`every role dealt to ${players} from "${scenario.title}" is playable`, dealt.every((role) => role.name && role.objective && (role.team === "liar" || role.team === "table")));
        ok(`no role is dealt twice to ${players} from "${scenario.title}"`, new Set(dealt.map((role) => role.name)).size === players);
    }
}

const written = {
    roles: [
        { name: "A", team: "liar", objective: "one", secret: "two" },
        { name: "B", team: "table", objective: "three", secret: "four" },
    ],
};
eq("a host-written scenario is dealt exactly as written", app.assignRoles(written, 2).length, 2);
ok("a host-written scenario keeps its teams", app.assignRoles(written, 2).some((role) => role.team === "liar"));

/* ------------------------------------------------------- the host's scenario */

const fitting = {
    title: "t",
    premise: "p",
    closing: "c",
    twists: ["1", "2", "3"],
    roles: [
        { name: "A", team: "liar", objective: "o" },
        { name: "B", team: "table", objective: "o" },
        { name: "C", team: "table", objective: "o" },
        { name: "D", team: "table", objective: "o" },
    ],
};

eq("a scenario that fits the table passes", app.validateScenario(fitting, 4, 1), "");
ok("too few roles is refused", app.validateScenario(fitting, 5, 1) !== "");
ok("too many roles is refused", app.validateScenario(fitting, 3, 1) !== "");
ok("the wrong number of liars is refused", app.validateScenario({ ...fitting, roles: fitting.roles.map((role) => ({ ...role, team: "table" })) }, 4, 1) !== "");
ok("two twists are refused", app.validateScenario({ ...fitting, twists: ["1", "2"] }, 4, 1) !== "");
ok("a missing closing line is refused", app.validateScenario({ ...fitting, closing: undefined }, 4, 1) !== "");
ok("a role with no objective is refused", app.validateScenario({ ...fitting, roles: fitting.roles.map((role, index) => (index ? role : { ...role, objective: undefined })) }, 4, 1) !== "");
ok("a scenario that is not an object is refused", app.validateScenario("nope", 4, 1) !== "");

/* -------------------------------------------------------------- reading JSON */

eq("plain JSON is read", app.cleanJson('{"a":1}').a, 1);
eq("fenced JSON is read", app.cleanJson('```json\n{"a":2}\n```').a, 2);
eq("JSON with prose around it is read", app.cleanJson('Sure! Here you go: {"a":3} Enjoy.').a, 3);
eq("nested braces survive", app.cleanJson('x {"a":{"b":[1,2]}} y').a.b.length, 2);
eq("text with no JSON gives nothing", app.cleanJson("no json at all"), null);
eq("half a JSON gives nothing", app.cleanJson('{"a":'), null);
eq("nothing at all gives nothing", app.cleanJson(undefined), null);

/* ---------------------------------------------------------------- the verdict */

const seats = [{ team: "table" }, { team: "liar" }, { team: "table" }, { team: "table" }];

eq("votes are counted per seat", app.tallyVotes([1, 1, 2, 1], 4), [0, 3, 1, 0]);
eq("votes for seats that do not exist are dropped", app.tallyVotes([9, 1], 4), [0, 1, 0, 0]);
ok("a clean plurality on a liar is a catch", app.verdictOf([1, 1, 2, 1], seats).caught === true);
ok("a plurality on the table is not a catch", app.verdictOf([0, 0, 1, 3], seats).caught === false);
ok("a tie is not a catch", app.verdictOf([0, 1, 0, 1], seats).caught === false);
ok("a tie is flagged", app.verdictOf([0, 1, 0, 1], seats).tie === true);
ok("no votes is not a catch", app.verdictOf([], seats).caught === false);
ok("out-of-range votes cannot win it", app.verdictOf([9, 9, 2, 3], seats).caught === false);

/* ------------------------------------------------------------------ the clock */

eq("90 seconds reads 1:30", app.clockText(90), "1:30");
eq("0 seconds reads 0:00", app.clockText(0), "0:00");
eq("59 seconds reads 0:59", app.clockText(59), "0:59");
eq("180 seconds reads 3:00", app.clockText(180), "3:00");
eq("a clock that ran past zero reads 0:00", app.clockText(-4), "0:00");

/* ------------------------------------------------- the page and the wiring */

const html = readFileSync(join(here, "index.html"), "utf8");
const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
eq("no id is used twice in the page", htmlIds.length - new Set(htmlIds).size, 0);

const wiring = source.match(/for \(const id of \[([\s\S]*?)\]\)/);
ok("the wiring list is where this test expects it", Boolean(wiring));

const camel = (id) => id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const wired = new Set([...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => camel(match[1])));
for (const match of source.matchAll(/el\.(\w+) = \$\("([^"]+)"\)/g)) wired.add(match[1]);

const reached = new Set([...source.matchAll(/\bel\.(\w+)/g)].map((match) => match[1]));
eq("every element the app reaches for is wired up", [...reached].filter((name) => !wired.has(name)), []);
eq("every id in the wiring list is really in the page", [...wired].filter((name) => !htmlIds.some((id) => camel(id) === name)), []);
eq("the wiring list holds ids, not keys", [...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter((id) => !htmlIds.includes(id)), []);

for (const screen of ["setup", "briefing", "deal", "rounds", "vote", "reveal"]) {
    ok(`the ${screen} screen is reachable`, source.includes(`state.screen = "${screen}"`));
}

const shown = source.match(/for \(const name of \[([\s\S]*?)\]\)/);
ok("the screen list is where this test expects it", Boolean(shown));
const screens = [...shown[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
eq("every screen the renderer switches is wired up", screens.filter((name) => !wired.has(name)), []);
eq("every screen it switches is reachable", screens.filter((name) => !source.includes(`state.screen = "${name}"`)), []);

/* ------------------------------------------------------------------- the end */

if (failures.length) {
    console.error(`${failures.length} checks failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
}

console.log(`ok — ${passed} checks passed`);
