/* Liar's Supper — a party deduction game with an AI host.
 *
 * One device is passed around the table. The host deals secret roles, narrates
 * three twists and reads the votes out loud. Offline it runs on a starter pack
 * and the device voice; signed in, it writes a fresh scenario every game and
 * speaks with a Pollinations voice, billed to the host's own Pollen.
 */

const GEN = "https://gen.pollinations.ai";
const ENTER = "https://enter.pollinations.ai";
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");

const SS = { token: "ls.token", verifier: "ls.verifier", state: "ls.state" };
const PREF = "ls.prefs";
const APPKEY = "ls.appkey";
const DEFAULT_APPKEY = "pk_xI3vZOVFgxG2xiwN";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const TWISTS = 3;
const TIMERS = [60, 90, 120, 180];
const TEAM_LABEL = { liar: "working against the table", table: "with the table" };

const el = {};
const state = {
    mode: "free", // "free" | "key"
    token: "",
    screen: "setup",
    count: 6,
    timer: 90,
    source: "pack",
    voiceMode: "browser",
    names: [],
    scenario: null,
    dealt: [],
    dealIndex: 0,
    round: 0,
    votes: [],
    voteIndex: 0,
    seen: false,
    score: { table: 0, liars: 0 },
    aiModel: "",
    voiceModel: "",
    voice: "",
    tick: null,
    left: 0,
};

/* ------------------------------------------------------------------ plumbing */

function $(id) {
    return document.getElementById(id);
}

let toastTimer = null;

function toast(message, ms = 7000) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function randomToken(bytes) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function apiError(response, what) {
    let detail = "";
    try {
        const data = await response.json();
        const raw = data?.error?.message ?? data?.message ?? data?.error;
        detail = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
    } catch {
        // not JSON; the status is enough
    }
    if (response.status === 401) return `The ${what} call needs a valid Pollinations key. Sign in or paste one.`;
    if (response.status === 402 || response.status === 403) return `The ${what} call was refused${detail ? `: ${detail}` : " — check your Pollen or the key's scope"}.`;
    if (response.status === 429) return "Too many requests just now. Wait a few seconds and try again.";
    return `The ${what} call failed (${response.status})${detail ? `: ${detail}` : ""}.`;
}

/* ------------------------------------------------------------------- the host */

async function chat(model, system, user) {
    const response = await fetch(`${GEN}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 1600,
        }),
    });
    if (!response.ok) throw new Error(await apiError(response, "host"));
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "";
}

function cleanJson(text) {
    if (typeof text !== "string") return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
}

function liarCount(players) {
    if (players <= 6) return 1;
    if (players <= 9) return 2;
    return 3;
}

function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// A scenario is only usable if it fits the table exactly: one role per player,
// the right number of liars, and three twists to narrate.
function validateScenario(data, players, liars) {
    if (!data || typeof data !== "object") return "no scenario came back";
    if (typeof data.title !== "string" || typeof data.premise !== "string" || typeof data.closing !== "string") {
        return "the scenario is missing its title, premise or closing line";
    }
    if (!Array.isArray(data.roles)) return "the scenario has no roles";
    if (data.roles.length !== players) return `the host wrote ${data.roles.length} roles for ${players} players`;
    if (!Array.isArray(data.twists) || data.twists.length < TWISTS) return "fewer than three twists";
    const marked = data.roles.filter((role) => role && role.team === "liar").length;
    if (marked !== liars) return `the host marked ${marked} liars instead of ${liars}`;
    for (const role of data.roles) {
        if (!role || typeof role.name !== "string" || typeof role.objective !== "string") return "a role is missing its name or objective";
    }
    return "";
}

function scenarioFromPack(players) {
    const pack = window.LIARS_PACK;
    const base = pack[Math.floor(Math.random() * pack.length)];
    return {
        title: base.title,
        premise: base.premise,
        closing: base.closing,
        twists: shuffle(base.twists),
        liars: base.liars,
        table: base.table,
        source: "the starter pack",
    };
}

async function scenarioFromAI(players) {
    const liars = liarCount(players);
    const system = "You write social-deduction party games. You answer with JSON only — no prose, no code fences, no comments.";
    const brief = `Write a fresh scenario for a pass-and-play party game with ${players} players sitting around one table.
Exactly ${liars} of them are secretly working against the table; the other ${players - liars} are ordinary members of the group.
Answer with JSON only, in exactly this shape:
{"title":"three to five words","premise":"two or three sentences setting the scene and saying what the table has to decide","roles":[{"name":"a role name","team":"liar or table","objective":"what this player wants, one sentence","secret":"one private fact, one sentence"}],"twists":["a complication the host narrates between rounds","a second one","a third one"],"closing":"one sentence the host reads after the votes are in"}
Hard rules: exactly ${players} roles, exactly ${liars} of them with team "liar"; no role name may give away which team it is on; every objective must be playable by talking, with nothing for the app to track; exactly three twists, each a new complication; no two roles alike.`;
    const data = cleanJson(await chat(state.aiModel || "openai", system, brief));
    const problem = validateScenario(data, players, liars);
    if (problem) throw new Error(`The host's scenario did not fit the table (${problem}).`);
    return {
        title: data.title,
        premise: data.premise,
        closing: data.closing,
        twists: data.twists.slice(0, TWISTS).map(String),
        roles: data.roles.map((role) => ({
            name: String(role.name),
            team: role.team === "liar" ? "liar" : "table",
            objective: String(role.objective),
            secret: typeof role.secret === "string" ? role.secret : "",
        })),
        source: `${state.aiModel || "openai"}, written for this table`,
    };
}

// Deals one role per player: the right number of liars, and named roles first so
// the fillers only show up at the biggest tables.
function assignRoles(scenario, players) {
    if (scenario.roles) return shuffle(scenario.roles); // already a full, team-marked list from the host
    const liars = shuffle(scenario.liars).slice(0, liarCount(players)).map((role) => ({ ...role, team: "liar" }));
    const fillers = window.LIARS_FILLERS || [];
    const table = shuffle(scenario.table.concat(fillers)).slice(0, players - liars.length).map((role) => ({ ...role, team: "table" }));
    return shuffle(liars.concat(table));
}

/* ------------------------------------------------------------------- the voice */

let audio = null;

function deviceVoice(text) {
    if (!("speechSynthesis" in window)) {
        toast("This browser has no device voice. Pick another voice, or read it yourself.");
        return;
    }
    speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text);
    line.rate = 0.94;
    line.pitch = 0.85;
    speechSynthesis.speak(line);
}

function stopVoice() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (audio) {
        audio.pause();
        audio = null;
    }
}

async function speak(text) {
    if (!text || state.voiceMode === "silent") return;
    if (state.voiceMode === "pollinations" && state.token) {
        try {
            const body = {
                model: state.voiceModel || "elevenlabs/eleven-v3",
                input: text,
                response_format: "mp3",
            };
            if (state.voice) body.voice = state.voice;
            const response = await fetch(`${GEN}/v1/audio/speech`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await apiError(response, "voice"));
            stopVoice();
            audio = new Audio(URL.createObjectURL(await response.blob()));
            await audio.play();
            return;
        } catch (error) {
            toast(`${error.message} Falling back to this device's voice.`);
        }
    }
    deviceVoice(text);
}

/* -------------------------------------------------------------------- sign in */

function useKey(token, scope) {
    state.token = token;
    state.mode = "key";
    sessionStorage.setItem(SS.token, token);
    el.mode.textContent = scope?.includes("usage") ? "your own pollen" : "your own key";
    el.mode.classList.add("on");
    el.signin.classList.add("hidden");
    el.signout.classList.remove("hidden");
    el.signinBox.open = false;
    el.setupNote.textContent = "Signed in. The host writes a fresh scenario every game and speaks with a Pollinations voice, on your own Pollen.";
    syncMode();
    refreshWallet();
    loadModels();
    savePrefs();
}

function signOut() {
    state.token = "";
    state.mode = "free";
    sessionStorage.removeItem(SS.token);
    el.mode.textContent = "starter pack";
    el.mode.classList.remove("on");
    el.signin.classList.remove("hidden");
    el.signout.classList.add("hidden");
    el.wallet.classList.add("hidden");
    el.source.value = "pack";
    state.source = "pack";
    el.voiceMode.value = "browser";
    state.voiceMode = "browser";
    el.setupNote.textContent = "Offline the host runs on a starter pack of three scenarios and this device's voice. Sign in and it writes a new scenario every game and speaks with a Pollinations voice — on your own Pollen.";
    syncMode();
    savePrefs();
}

async function startAuth() {
    const appkey = el.appkey.value.trim();
    if (appkey) localStorage.setItem(APPKEY, appkey);
    else localStorage.removeItem(APPKEY);
    const verifier = randomToken(32);
    const nonce = randomToken(16);
    sessionStorage.setItem(SS.verifier, verifier);
    sessionStorage.setItem(SS.state, nonce);
    const params = new URLSearchParams({
        response_type: "code",
        redirect_uri: APP_URL,
        client_id: appkey || DEFAULT_APPKEY,
        scope: "profile usage",
        state: nonce,
        code_challenge: await s256(verifier),
        code_challenge_method: "S256",
        expiry: "30",
        budget: "25",
    });
    location.href = `${ENTER}/authorize?${params}`;
}

async function finishAuth(code, returnedState) {
    const verifier = sessionStorage.getItem(SS.verifier);
    const expected = sessionStorage.getItem(SS.state);
    sessionStorage.removeItem(SS.verifier);
    sessionStorage.removeItem(SS.state);
    if (!verifier) throw new Error("That sign-in attempt expired. Press sign in again.");
    if (expected && returnedState && expected !== returnedState) throw new Error("The sign-in state did not match. Press sign in again.");
    const appkey = localStorage.getItem(APPKEY);
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: APP_URL,
        code_verifier: verifier,
        client_id: appkey || DEFAULT_APPKEY,
    });
    const response = await fetch(`${ENTER}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!response.ok) throw new Error(await apiError(response, "sign-in"));
    const data = await response.json();
    if (!data?.access_token) throw new Error("No key came back from sign-in.");
    useKey(data.access_token, data.scope || "");
}

async function refreshWallet() {
    if (!state.token) {
        el.wallet.classList.add("hidden");
        return;
    }
    try {
        const response = await fetch(`${GEN}/account/balance`, { headers: authHeaders() });
        if (!response.ok) return;
        const value = findNumber(await response.json());
        if (value === null) return;
        el.wallet.textContent = `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} pollen`;
        el.wallet.title = "Your Pollinations balance";
        el.wallet.classList.remove("hidden");
    } catch {
        // the balance chip is a nicety, never a blocker
    }
}

function findNumber(data, depth = 0) {
    if (depth > 2 || !data || typeof data !== "object") return null;
    for (const key of ["pollen", "balance", "available", "remaining", "total", "amount"]) {
        if (typeof data[key] === "number") return data[key];
    }
    for (const value of Object.values(data)) {
        const found = findNumber(value, depth + 1);
        if (found !== null) return found;
    }
    return null;
}

/* --------------------------------------------------------------------- models */

async function listModels(kind) {
    const response = await fetch(`${GEN}/${kind}/models`);
    if (!response.ok) return [];
    const data = await response.json();
    const list = Array.isArray(data) ? data : data?.data ?? [];
    return list.filter((model) => model && typeof model === "object");
}

function fillSelect(select, items, selected, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = placeholder;
        select.append(option);
    }
    for (const item of items) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.append(option);
    }
    if (selected) {
        if (![...select.options].some((option) => option.value === selected)) {
            const option = document.createElement("option");
            option.value = selected;
            option.textContent = selected;
            select.prepend(option);
        }
        select.value = selected;
    }
    if (!select.value && select.options.length) select.selectedIndex = 0;
}

async function loadModels() {
    if (state.mode !== "key") return;
    try {
        const [texts, audios] = await Promise.all([listModels("text"), listModels("audio")]);
        fillSelect(
            el.textModel,
            texts
                .filter((model) => !model.community && model.name)
                .map((model) => ({ value: model.name, label: model.name })),
            state.aiModel,
            "openai",
        );
        const speech = audios.filter(
            (model) => !model.community && model.name && (model.supported_endpoints || []).includes("/v1/audio/speech"),
        );
        fillSelect(
            el.voiceModel,
            speech.map((model) => ({ value: model.name, label: model.name })),
            state.voiceModel,
            "elevenlabs/eleven-v3",
        );
        const chosen = speech.find((model) => model.name === el.voiceModel.value);
        fillSelect(
            el.voice,
            (chosen?.voices || []).map((name) => ({ value: name, label: name })),
            state.voice,
            "model default",
        );
    } catch {
        // keep whatever is already in the selects
    }
}

function syncMode() {
    const free = state.mode === "free";
    for (const node of [el.textModel, el.voiceModel, el.voice]) node.disabled = free;
    el.textModel.title = free ? "Sign in to choose the model that writes the scenario" : "";
    el.voiceModel.title = free ? "Sign in to choose a narration voice" : "";
    for (const option of el.source.options) {
        if (option.value === "ai") option.disabled = free;
    }
    if (free && el.source.value === "ai") el.source.value = "pack";
    for (const option of el.voiceMode.options) {
        if (option.value === "pollinations") option.disabled = free;
    }
    if (free && el.voiceMode.value === "pollinations") el.voiceMode.value = "browser";
    el.authNote.textContent = free
        ? "Sign in is the authorization-code flow with PKCE. Nothing is stored beyond this tab."
        : "Signed in. Your key lives in this tab only; close the tab and it is gone.";
    el.source.value = free || state.source !== "ai" ? "pack" : "ai";
    el.voiceMode.value = free ? "browser" : state.voiceMode;
}

/* ------------------------------------------------------------------ the table */

function buildCountOptions() {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
        const option = document.createElement("option");
        option.value = String(n);
        option.textContent = `${n} players — ${liarCount(n)} working against the table`;
        el.count.append(option);
    }
    for (const seconds of TIMERS) {
        const option = document.createElement("option");
        option.value = String(seconds);
        option.textContent = `${seconds} seconds`;
        el.timer.append(option);
    }
}

function defaultNames(count) {
    const current = [...el.names.querySelectorAll("input")].map((input) => input.value.trim());
    return Array.from({ length: count }, (_, index) => current[index] || `Player ${index + 1}`);
}

function paintNames() {
    const names = defaultNames(state.count);
    el.names.innerHTML = "";
    names.forEach((name, index) => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = name;
        input.maxLength = 18;
        input.setAttribute("aria-label", `Player ${index + 1} name`);
        el.names.append(input);
    });
    state.names = names;
}

function readNames() {
    const inputs = [...el.names.querySelectorAll("input")];
    return inputs.map((input, index) => input.value.trim() || `Player ${index + 1}`);
}

async function openTable() {
    state.count = Number(el.count.value);
    state.timer = Number(el.timer.value);
    state.source = el.source.value;
    state.voiceMode = el.voiceMode.value;
    state.aiModel = el.textModel.value;
    state.voiceModel = el.voiceModel.value;
    state.voice = el.voice.value;
    state.names = readNames();
    savePrefs();

    const players = state.count;
    el.open.disabled = true;
    el.open.textContent = state.source === "ai" ? "The host is writing…" : "Setting the table…";
    try {
        if (state.source === "ai") {
            if (!state.token) throw new Error("Sign in first, or let the starter pack write this one.");
            state.scenario = await scenarioFromAI(players);
        } else {
            state.scenario = scenarioFromPack(players);
        }
        state.dealt = assignRoles(state.scenario, players);
        state.dealIndex = 0;
        state.round = 0;
        state.votes = [];
        state.voteIndex = 0;
        showBriefing();
    } catch (error) {
        toast(error.message);
        if (state.source === "ai") {
            state.scenario = scenarioFromPack(players);
            state.dealt = assignRoles(state.scenario, players);
            state.dealIndex = 0;
            state.round = 0;
            state.votes = [];
            state.voteIndex = 0;
            showBriefing();
        }
    } finally {
        el.open.disabled = false;
        el.open.textContent = "Open the table";
    }
}

function showBriefing() {
    el.scenarioTitle.textContent = state.scenario.title;
    el.premise.textContent = state.scenario.premise;
    state.screen = "briefing";
    render();
    speak(state.scenario.premise);
}

/* ----------------------------------------------------------------- the deal */

function paintDeal() {
    const name = state.names[state.dealIndex];
    el.dealName.textContent = name;
    el.dealKicker.textContent = `Pass the device to ${name}`;
    el.dealProgress.textContent = `Role ${state.dealIndex + 1} of ${state.count}. Hold the panel to read it; let go and it hides again.`;
    el.roleCard.classList.add("hidden");
    el.dealNext.classList.add("hidden");
    state.seen = false;
    state.screen = "deal";
    render();
}

function showRole() {
    const role = state.dealt[state.dealIndex];
    if (!role) return;
    el.roleTeam.textContent = TEAM_LABEL[role.team] || TEAM_LABEL.table;
    el.roleTeam.classList.toggle("liar", role.team === "liar");
    el.roleName.textContent = role.name;
    el.roleObjective.textContent = role.objective;
    el.roleSecret.textContent = role.secret || "—";
    el.roleCard.classList.remove("hidden");
    state.seen = true;
}

function hideRole() {
    el.roleCard.classList.add("hidden");
    if (state.seen) el.dealNext.classList.remove("hidden");
}

function nextPlayer() {
    state.dealIndex += 1;
    if (state.dealIndex >= state.count) {
        state.round = 1;
        startRound();
        return;
    }
    paintDeal();
}

/* --------------------------------------------------------------- the rounds */

function startRound() {
    const twist = state.scenario.twists[state.round - 1];
    el.roundKicker.textContent = `Round ${state.round} of ${TWISTS}`;
    el.twist.textContent = twist;
    el.nextRound.textContent = state.round >= TWISTS ? "Go to the vote" : "Next twist";
    state.screen = "rounds";
    timerReset();
    render();
    speak(twist);
}

function clockText(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function paintClock() {
    el.clock.textContent = clockText(state.left);
    el.clock.classList.toggle("out", state.left <= 0);
}

function timerStop() {
    clearInterval(state.tick);
    state.tick = null;
    el.timerToggle.textContent = "Start the timer";
}

function timerReset() {
    timerStop();
    state.left = state.timer;
    paintClock();
}

function chime() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const note = context.createOscillator();
        const gain = context.createGain();
        note.connect(gain);
        gain.connect(context.destination);
        note.frequency.value = 660;
        gain.gain.setValueAtTime(0.14, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.1);
        note.start();
        note.stop(context.currentTime + 1.15);
    } catch {
        // a silent chime is still a finished timer
    }
}

function timerToggle() {
    if (state.tick) {
        timerStop();
        return;
    }
    if (state.left <= 0) state.left = state.timer;
    el.timerToggle.textContent = "Pause";
    state.tick = setInterval(() => {
        state.left -= 1;
        paintClock();
        if (state.left <= 0) {
            timerStop();
            chime();
        }
    }, 1000);
}

/* --------------------------------------------------------------- the votes */

function paintVote() {
    const voter = state.voteIndex;
    el.voteKicker.textContent = `Pass the device to ${state.names[voter]}`;
    el.voteName.textContent = state.names[voter];
    el.voteButtons.innerHTML = "";
    state.names.forEach((name, index) => {
        if (index === voter) return;
        const button = document.createElement("button");
        button.className = "btn vote";
        button.textContent = name;
        button.addEventListener("click", () => castVote(index));
        el.voteButtons.append(button);
    });
    state.screen = "vote";
    render();
}

function castVote(target) {
    state.votes[state.voteIndex] = target;
    state.voteIndex += 1;
    if (state.voteIndex >= state.count) {
        showReveal();
        return;
    }
    paintVote();
}

function tallyVotes(votes, total) {
    const counts = new Array(total).fill(0);
    for (const target of votes) {
        if (Number.isInteger(target) && target >= 0 && target < total) counts[target] += 1;
    }
    return counts;
}

// The table wins only on a clean plurality for a liar: a tie means it could not
// agree, and the liars walk away with it.
function verdictOf(votes, dealt) {
    const counts = tallyVotes(votes, dealt.length);
    let top = -1;
    let best = -1;
    let tie = false;
    counts.forEach((count, index) => {
        if (count > best) {
            best = count;
            top = index;
            tie = false;
        } else if (count === best && count > 0) {
            tie = true;
        }
    });
    const caught = best > 0 && !tie && dealt[top]?.team === "liar";
    return { caught, tie, top, best, counts };
}

function showReveal() {
    const result = verdictOf(state.votes, state.dealt);
    if (result.caught) state.score.table += 1;
    else state.score.liars += 1;

    el.verdict.textContent = result.caught
        ? "The table caught the liar."
        : result.tie
          ? "The table split, and the liar walked away with it."
          : "The liar walked away with it.";

    el.tally.innerHTML = "";
    state.names.forEach((name, index) => {
        const role = state.dealt[index];
        const row = document.createElement("div");
        row.className = "tally-row";
        row.classList.toggle("liar", role?.team === "liar");
        row.classList.toggle("top", index === result.top && result.best > 0);
        const bar = document.createElement("span");
        bar.className = "tally-bar";
        bar.style.width = `${result.best ? Math.max(6, (result.counts[index] / result.best) * 100) : 0}%`;
        const label = document.createElement("span");
        label.className = "tally-label";
        label.textContent = `${name} — ${result.counts[index]} ${result.counts[index] === 1 ? "vote" : "votes"}`;
        row.append(bar, label);
        el.tally.append(row);
    });

    el.closing.textContent = state.scenario.closing;

    el.rolesList.innerHTML = "";
    state.dealt.forEach((role, index) => {
        const item = document.createElement("li");
        item.classList.toggle("liar", role.team === "liar");
        const who = document.createElement("strong");
        who.textContent = `${state.names[index]} — ${role.name}`;
        const team = document.createElement("em");
        team.textContent = TEAM_LABEL[role.team] || TEAM_LABEL.table;
        const objective = document.createElement("span");
        objective.textContent = role.objective;
        const secret = document.createElement("span");
        secret.className = "fine";
        secret.textContent = role.secret ? `Secret: ${role.secret}` : "";
        item.append(who, team, objective, secret);
        el.rolesList.append(item);
    });

    el.score.textContent = `The table ${state.score.table} — ${state.score.liars} the liars, across this session. Scenario: ${state.scenario.source}.`;

    state.screen = "reveal";
    render();
    speak(`${state.scenario.closing} ${result.caught ? "The table caught the liar." : "The liar got away with it."}`);
}

/* ------------------------------------------------------------------- screens */

function render() {
    for (const name of ["setup", "briefing", "deal", "rounds", "vote", "reveal"]) {
        el[name].classList.toggle("hidden", state.screen !== name);
    }
    if (state.screen === "deal") {
        el.dealNext.classList.toggle("hidden", !state.seen);
    }
    el.mode.textContent = state.mode === "free" ? "starter pack" : "your own pollen";
    el.mode.classList.toggle("on", state.mode !== "free");
}

function savePrefs() {
    try {
        localStorage.setItem(
            PREF,
            JSON.stringify({
                count: state.count,
                timer: state.timer,
                source: state.source,
                voiceMode: state.voiceMode,
                aiModel: state.aiModel,
                voiceModel: state.voiceModel,
                voice: state.voice,
            }),
        );
    } catch {
        // private mode; defaults are fine
    }
}

function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREF) || "{}");
        if (Number.isInteger(saved.count) && saved.count >= MIN_PLAYERS && saved.count <= MAX_PLAYERS) state.count = saved.count;
        if (TIMERS.includes(saved.timer)) state.timer = saved.timer;
        if (saved.source === "ai" || saved.source === "pack") state.source = saved.source;
        if (["browser", "pollinations", "silent"].includes(saved.voiceMode)) state.voiceMode = saved.voiceMode;
        for (const key of ["aiModel", "voiceModel", "voice"]) {
            if (typeof saved[key] === "string") state[key] = saved[key];
        }
    } catch {
        // nothing saved yet
    }
}

async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) return;
    history.replaceState(null, "", location.pathname);
    try {
        await finishAuth(code, params.get("state"));
        toast("Signed in. The host can write a fresh scenario for every table.");
    } catch (error) {
        toast(error.message);
    }
}

/* ---------------------------------------------------------------- wiring up */

function bindShield() {
    const show = (event) => {
        if (event.type === "keydown" && event.key !== " " && event.key !== "Enter") return;
        if (event.type === "keydown") event.preventDefault();
        if (state.screen !== "deal") return;
        showRole();
    };
    const hide = () => {
        if (state.screen !== "deal") return;
        hideRole();
    };
    el.shield.addEventListener("pointerdown", show);
    el.shield.addEventListener("keydown", show);
    window.addEventListener("pointerup", hide);
    el.shield.addEventListener("keyup", hide);
    el.shield.addEventListener("pointerleave", hide);
    el.shield.addEventListener("pointercancel", hide);
}

function wire() {
    el.count.addEventListener("change", () => {
        state.count = Number(el.count.value);
        paintNames();
        savePrefs();
    });
    el.shuffleNames.addEventListener("click", () => {
        state.count = Number(el.count.value);
        const names = defaultNames(state.count);
        el.names.innerHTML = "";
        shuffle(names).forEach((name, index) => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = name;
            input.maxLength = 18;
            input.setAttribute("aria-label", `Player ${index + 1} name`);
            el.names.append(input);
        });
    });
    el.open.addEventListener("click", openTable);
    el.readBrief.addEventListener("click", () => speak(state.scenario?.premise || ""));
    el.dealRoles.addEventListener("click", () => {
        state.dealIndex = 0;
        paintDeal();
    });
    el.dealNext.addEventListener("click", nextPlayer);
    el.readTwist.addEventListener("click", () => speak(state.scenario?.twists[state.round - 1] || ""));
    el.nextRound.addEventListener("click", () => {
        stopVoice();
        if (state.round >= TWISTS) {
            state.voteIndex = 0;
            paintVote();
            return;
        }
        state.round += 1;
        startRound();
    });
    el.timerToggle.addEventListener("click", timerToggle);
    el.timerReset.addEventListener("click", timerReset);
    el.again.addEventListener("click", async () => {
        stopVoice();
        state.screen = "setup";
        render();
        await openTable();
    });
    el.back.addEventListener("click", () => {
        stopVoice();
        state.screen = "setup";
        render();
    });
    el.signin.addEventListener("click", () => {
        el.signinBox.open = true;
        el.signinBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    el.signout.addEventListener("click", signOut);
    el.oauth.addEventListener("click", startAuth);
    el.usekey.addEventListener("click", () => {
        const token = el.pastekey.value.trim();
        if (!token) {
            toast("Paste a key first, or use the sign-in button.");
            return;
        }
        el.pastekey.value = "";
        useKey(token, "");
    });
    el.source.addEventListener("change", () => {
        state.source = el.source.value;
        if (state.source === "ai" && !state.token) {
            el.signinBox.open = true;
            toast("A fresh scenario every game needs a signed-in host. The starter pack works right now.");
        }
        savePrefs();
    });
    el.voiceMode.addEventListener("change", () => {
        state.voiceMode = el.voiceMode.value;
        if (state.voiceMode === "pollinations" && !state.token) {
            el.signinBox.open = true;
            toast("A Pollinations voice needs a signed-in host. This device's voice is free.");
        }
        savePrefs();
    });
    for (const node of [el.textModel, el.voiceModel, el.voice]) {
        node.addEventListener("change", () => {
            state.aiModel = el.textModel.value;
            state.voiceModel = el.voiceModel.value;
            state.voice = el.voice.value;
            savePrefs();
        });
    }
    bindShield();
}

function init() {
    for (const id of [
        "wallet", "mode", "signin", "signout",
        "setup", "count", "timer", "source", "voice-mode", "text-model", "voice-model", "voice",
        "names", "open", "shuffle-names", "setup-note", "signin-box", "oauth", "pastekey", "usekey", "appkey", "auth-note",
        "briefing", "scenario-title", "premise", "read-brief", "deal", "deal-roles",
        "deal-kicker", "deal-name", "shield", "role-card", "role-team", "role-name", "role-objective", "role-secret",
        "deal-next", "deal-progress",
        "rounds", "round-kicker", "twist", "clock", "timer-toggle", "timer-reset", "read-twist", "next-round",
        "vote", "vote-kicker", "vote-name", "vote-buttons",
        "reveal", "verdict", "tally", "closing", "roles-list", "score", "again", "back", "toast",
    ]) {
        el[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = $(id);
    }
    el.signinBox = $("signin-box");
    el.shuffleNames = $("shuffle-names");
    el.scenarioTitle = $("scenario-title");
    el.rolesList = $("roles-list");
    el.timerToggle = $("timer-toggle");
    el.voiceMode = $("voice-mode");
    el.textModel = $("text-model");
    el.voiceModel = $("voice-model");
    el.authNote = $("auth-note");
    el.setupNote = $("setup-note");
    el.nextRound = $("next-round");
    el.readTwist = $("read-twist");
    el.readBrief = $("read-brief");
    el.dealNext = $("deal-next");
    el.dealKicker = $("deal-kicker");
    el.dealName = $("deal-name");
    el.dealProgress = $("deal-progress");
    el.roleCard = $("role-card");
    el.roleTeam = $("role-team");
    el.roleName = $("role-name");
    el.roleObjective = $("role-objective");
    el.roleSecret = $("role-secret");
    el.voteKicker = $("vote-kicker");
    el.voteName = $("vote-name");
    el.voteButtons = $("vote-buttons");
    el.roundKicker = $("round-kicker");
    el.timerReset = $("timer-reset");

    buildCountOptions();
    loadPrefs();
    el.count.value = String(state.count);
    el.timer.value = String(state.timer);
    el.source.value = state.source === "ai" ? "ai" : "pack";
    el.voiceMode.value = state.voiceMode;
    paintNames();
    paintClock();
    wire();
    syncMode();
    render();

    const stored = sessionStorage.getItem(SS.token);
    if (stored) useKey(stored, "");
    handleRedirect();
}

if (typeof document !== "undefined" && document.getElementById) {
    init();
}
