/** Re-export shared clock sync — single implementation for web + mobile. */
export {
  type MonotonicAnchor,
  MAX_INFLATED_RTT_OVER_MIN_MS,
  MAX_ABSOLUTE_RTT_MS,
  createMonotonicAnchor,
  readMonotonicNow,
  shouldDiscardNtpSample,
  applyServerTimeSync,
  applyNtpSample,
  clockSync,
} from "@whiteout/shared";
