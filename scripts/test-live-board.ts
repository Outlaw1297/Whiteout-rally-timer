/**
 * Public live board must keep rallies visible from GO until target arrival.
 * Status flips to COMPLETED at last throw (~30s after GO with short marches).
 */
import {
  isLiveOnPublicBoard,
  mergeLiveBoardEvents,
} from "../src/lib/select-active-events";

function assert(condition: unknown, label: string) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

const now = Date.parse("2026-08-14T04:15:00Z");
const test1 = {
  id: "1",
  status: "COMPLETED",
  name: "Test1",
  targetArrivalTime: "2026-08-14T04:18:56.410Z",
};
const test2 = {
  id: "2",
  status: "COMPLETED",
  name: "Test2",
  targetArrivalTime: "2026-08-14T04:18:34.410Z",
};
const active = { id: "a", status: "ACTIVE", name: "Running" };
const old = {
  id: "3",
  status: "COMPLETED",
  name: "Old",
  targetArrivalTime: "2026-08-14T03:00:00.000Z",
};
const draft = { id: "4", status: "DRAFT", name: "SVS" };

const oldClientBehavior = (batches: { id: string; status: string }[][]) => {
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    return batch.filter((e) => String(e.status).toUpperCase() === "ACTIVE");
  }
  return [];
};

const emptyThenHome = [[], [test1, test2, old, draft]];
assert(
  oldClientBehavior(emptyThenHome).length === 0,
  "old client treats empty live-rallies / COMPLETED as nothing live"
);
assert(
  mergeLiveBoardEvents(emptyThenHome, now)
    .map((e) => e.name)
    .join(",") === "Test1,Test2",
  "board keeps COMPLETED rallies until target arrival"
);

assert(isLiveOnPublicBoard(test1, now) === true, "Test1 still live at 04:15 with 04:18 arrival");
assert(isLiveOnPublicBoard(test2, now) === true, "Test2 still live at 04:15 with 04:18 arrival");
assert(isLiveOnPublicBoard(old, now) === false, "old completed rally is off the board");
assert(isLiveOnPublicBoard(draft, now) === false, "templates stay off the board");
assert(isLiveOnPublicBoard(active, now) === true, "ACTIVE rallies always show");

assert(
  mergeLiveBoardEvents([[test2], [test1, test2]], now)
    .map((e) => e.id)
    .join(",") === "2,1",
  "dedupes by id and keeps first-seen order"
);

assert(
  mergeLiveBoardEvents([[old, draft], []], now).length === 0,
  "past completed / template rows stay off the live board"
);

assert(
  mergeLiveBoardEvents([[{ id: "x", status: "active" }]], now)[0]?.id === "x",
  "status match is case-insensitive"
);

console.log("All live-board merge tests passed.");
