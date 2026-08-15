"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isIOSDevice } from "@/lib/push-support";
import { DEFAULT_PUSH_LEAD_MS } from "@/lib/timing";

export type CalibrationPhase = "idle" | "running" | "complete" | "partial" | "failed";

export interface CalibrationState {
  phase: CalibrationPhase;
  received: number;
  total: number;
  deliveryLeadMs: number | null;
  message: string | null;
  learnedLeadMs: number | null;
}

const CALIBRATION_TIMEOUT_MS = 18_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCalibrationStatus() {
  const res = await fetch("/api/push/calibrate", { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<{
    totalSamples: number;
    maxLeadMs: number;
    isCalibrated: boolean;
  }>;
}

export function usePushCalibration() {
  const [state, setState] = useState<CalibrationState>({
    phase: "idle",
    received: 0,
    total: 3,
    deliveryLeadMs: null,
    message: null,
    learnedLeadMs: null,
  });

  const runningRef = useRef(false);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ index: number; total: number }>).detail;
      if (!detail) return;
      setState((prev) => {
        if (prev.phase !== "running") return prev;
        return {
          ...prev,
          received: Math.max(prev.received, detail.index),
          total: detail.total,
        };
      });
    };

    window.addEventListener("push-calibration-progress", onProgress);
    return () => window.removeEventListener("push-calibration-progress", onProgress);
  }, []);

  const runCalibration = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    setState((prev) => ({
      phase: "running",
      received: 0,
      total: 3,
      deliveryLeadMs: null,
      message: "Keep this screen open for a few seconds while we measure delivery timing.",
      learnedLeadMs: prev.learnedLeadMs,
    }));

    try {
      if (isIOSDevice()) {
        setState({
          phase: "complete",
          received: 0,
          total: 0,
          deliveryLeadMs: DEFAULT_PUSH_LEAD_MS,
          learnedLeadMs: DEFAULT_PUSH_LEAD_MS,
          message:
            "iPhone keeps throw alerts visible. Silent timing pings are skipped so Apple does not stop later notifications.",
        });
        return;
      }

      const before = await fetchCalibrationStatus();
      const samplesBefore = before?.totalSamples ?? 0;

      const res = await fetch("/api/push/calibrate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({
          phase: "failed",
          received: 0,
          total: 3,
          deliveryLeadMs: null,
          message: data.error || "Calibration could not start.",
          learnedLeadMs: null,
        });
        return;
      }

      const data = await res.json();
      const total = data.total ?? 3;
      const targetSamples = (data.samplesBefore ?? samplesBefore) + total;
      const deadline = Date.now() + CALIBRATION_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const status = await fetchCalibrationStatus();
        if (status && status.totalSamples >= targetSamples) {
          setState({
            phase: "complete",
            received: total,
            total,
            deliveryLeadMs: status.maxLeadMs,
            learnedLeadMs: status.maxLeadMs,
            message: `This device is calibrated to about ${status.maxLeadMs}ms lead.`,
          });
          return;
        }
        await sleep(500);
      }

      const finalStatus = await fetchCalibrationStatus();
      const gained = (finalStatus?.totalSamples ?? 0) - samplesBefore;

      if (gained > 0 && finalStatus) {
        setState({
          phase: "partial",
          received: gained,
          total,
          deliveryLeadMs: finalStatus.maxLeadMs,
          learnedLeadMs: finalStatus.maxLeadMs,
          message: `Partial calibration (${gained}/${total} samples). Rally alerts will still work; try again on Wi‑Fi if timing feels off.`,
        });
      } else {
        setState({
          phase: "failed",
          received: 0,
          total,
          deliveryLeadMs: null,
          learnedLeadMs: null,
          message:
            "Calibration timed out. Check notification permission and try Send test notification.",
        });
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const dismissCalibration = useCallback(() => {
    setState((prev) => ({
      phase: "idle",
      received: 0,
      total: 3,
      deliveryLeadMs: null,
      message: null,
      learnedLeadMs: prev.learnedLeadMs ?? prev.deliveryLeadMs,
    }));
  }, []);

  const loadCalibrationStatus = useCallback(async () => {
    const status = await fetchCalibrationStatus();
    if (!status?.isCalibrated) return;
    setState((prev) => ({
      ...prev,
      phase: "idle",
      learnedLeadMs: status.maxLeadMs,
      deliveryLeadMs: status.maxLeadMs,
    }));
  }, []);

  return {
    calibration: state,
    runCalibration,
    dismissCalibration,
    loadCalibrationStatus,
    isCalibrating: state.phase === "running",
  };
}
