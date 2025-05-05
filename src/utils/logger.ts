import { PLUGIN_ID } from "../constants";
import { Roarr, ROARR, type RoarrGlobalState } from "roarr";

// Create a child logger with plugin context
export const log = Roarr.child({ plugin: PLUGIN_ID });

/**
 * Enable or disable Roarr debug logging at runtime (browser/dev only).
 * In Node.js, use the ROARR_LOG env var instead.
 * @param enabled Whether to turn on debug logging
 */
export function enableRoarrLogging(enabled: boolean): void {
  // In browser, set ROARR.write to console.debug; in Node, use env var
  if (typeof window !== "undefined" || typeof globalThis !== "undefined") {
    const roarrGlobal = (globalThis as any).ROARR as RoarrGlobalState;
    if (enabled) {
      roarrGlobal.write = (messageStr: string) => {
        try {
          const logObj = JSON.parse(messageStr);
          const prefix = logObj.context?.plugin
            ? `[${logObj.context.plugin}] `
            : "";
          // Use debug for dev, info for prod
          (console.debug || console.log)(prefix + logObj.message, logObj);
        } catch {
          (console.debug || console.log)(messageStr);
        }
      };
    } else {
      roarrGlobal.write = () => {};
    }
  }
}
