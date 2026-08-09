import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("VAPID Keys Generated:\n");
console.log("Paste into Render → Environment (one line each, NO quotes, NO spaces):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@example.com`);
console.log("\n⚠️  Both keys must be from the SAME generation — do not mix old/new keys.");
