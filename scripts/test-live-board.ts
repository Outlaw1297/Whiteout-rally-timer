/**
 * Public live board must union ACTIVE rows from every list endpoint.
 * An empty 200 from a statically cached /api/live-rallies must not hide
 * ACTIVE rallies that Home already loaded from /api/events.
 */
import { mergeActiveEvents } from "../src/lib/select-active-events";

function assert(condition: unknown, label: string) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

const test1 = { id: "1", status: "ACTIVE", name: "Test1" };
const test2 = { id: "2", status: "ACTIVE", name: "Test2" };
const done = { id: "3", status: "COMPLETED", name: "Old" };
const draft = { id: "4", status: "DRAFT", name: "SVS" };

const oldClientBehavior = (batches: { id: string; status: string }[][]) => {
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    return batch.filter((e) => String(e.status).toUpperCase() === "ACTIVE");
  }
  return [];
};

const emptyThenHome = [[], [test1, test2, done, draft]];
assert(
  oldClientBehavior(emptyThenHome).length === 0,
  "old client treats empty live-rallies as final"
);
assert(
  mergeActiveEvents(emptyThenHome).map((e) => e.name).join(",") === "Test1,Test2",
  "new client unions ACTIVE rallies from /api/events"
);

assert(
  mergeActiveEvents([[test2], [test1, test2]]).map((e) => e.id).join(",") === "2,1",
  "dedupes by id and keeps first-seen order"
);

assert(
  mergeActiveEvents([[done, draft], []]).length === 0,
  "completed/template rows stay off the live board"
);

assert(
  mergeActiveEvents([[{ id: "x", status: "active" }]])[0]?.id === "x",
  "status match is case-insensitive"
);

console.log("All live-board merge tests passed.");
