/* The name the client stores must survive the leaderboard function's own sanitizer untouched —
   if the two rules drift, submits silently store a different name than the player typed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setPlayerName, getPlayerName } from "../src/api.ts";

/* Copied verbatim from netlify/functions/submit-score.mts. */
const serverSanitize = (name: string) => String(name).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");

test("disallowed characters are stripped", () => {
  assert.equal(setPlayerName("Anh<script>Le"), "AnhscriptLe");
  assert.equal(setPlayerName("emoji🚗racer"), "emojiracer");
  assert.equal(setPlayerName("drop; DELETE * from"), "drop DELETE  from");
});

test("allowed characters are kept", () => {
  assert.equal(setPlayerName("Anh_Le-99 x"), "Anh_Le-99 x");
});

test("names are capped at the storage limit", () => {
  assert.equal(setPlayerName("a".repeat(50)).length, 20);
  /* The tag appended to a short name must not push it past the cap either. */
  assert.ok(setPlayerName("ab").length <= 20);
});

test("a short name gets a numeric tag so the shared leaderboard does not collide", () => {
  const name = setPlayerName("ann");
  assert.ok(/^ann\d{4}$/.test(name), `expected a tagged name, got ${name}`);
  /* Two players picking the same short name should not land on the same entry. */
  const many = new Set(Array.from({ length: 40 }, () => setPlayerName("ann")));
  assert.ok(many.size > 1, "the tag is not random — every short name collides");
});

test("a name at the length threshold is left alone", () => {
  assert.equal(setPlayerName("sixchr"), "sixchr");
});

test("an empty or all-junk name falls back to a generated one", () => {
  for (const raw of ["", "   ", "🚗🚗", "!!!???"]) {
    const name = setPlayerName(raw);
    assert.ok(name.length >= 6, `${JSON.stringify(raw)} produced a blank name: ${JSON.stringify(name)}`);
    assert.equal(name, serverSanitize(name), `the generated name would be rewritten by the server: ${name}`);
  }
});

test("whatever the client stores passes the server sanitizer unchanged", () => {
  const raws = ["Anh Le", "x", "", "  padded  ", "a".repeat(40), "ünïcodé", "tab\there", "🚗", "<b>bold</b>", "_-_-_-"];
  for (const raw of raws) {
    const stored = setPlayerName(raw);
    assert.equal(stored, serverSanitize(stored), `client and server disagree on ${JSON.stringify(raw)}`);
  }
});

test("the stored name is the one read back", () => {
  const stored = setPlayerName("RoadRunner");
  assert.equal(getPlayerName(), stored);
});

test("getPlayerName always returns something submittable", () => {
  const name = getPlayerName();
  assert.ok(name.length > 0);
  assert.equal(name, serverSanitize(name));
});
