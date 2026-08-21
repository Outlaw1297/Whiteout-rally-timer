import assert from "node:assert/strict";
import {
  expoEndpointFromToken,
  expoTokenFromEndpoint,
  isExpoPushEndpoint,
  isValidExpoPushToken,
} from "../src/lib/expo-push";

const token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";
assert.equal(isValidExpoPushToken(token), true);
assert.equal(isValidExpoPushToken("not-a-token"), false);

const endpoint = expoEndpointFromToken(token);
assert.equal(endpoint, `expo:${token}`);
assert.equal(isExpoPushEndpoint(endpoint), true);
assert.equal(expoTokenFromEndpoint(endpoint), token);
assert.equal(isExpoPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), false);

console.log("expo-push helpers ok");
