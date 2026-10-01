import { DeviceInfo } from "./people";
import { GeoInfo } from "./geoip";
import { ParsedUa } from "./ua";

/**
 * Bot scoring, 0–100 (plan §8). Bots are flagged, not dropped: their events are kept,
 * excluded from reports and presence, and listed under Visitors → Bots.
 * An admin override (human / bot) always wins.
 */
export interface BotSignals {
  ua: ParsedUa;
  automation: boolean;
  geo: GeoInfo | null;
  signedIn: boolean;
  device: DeviceInfo;
}

export const scoreBot = (s: BotSignals): number => {
  let score = 0;
  if (s.ua.is_bot_ua) score += 100;
  if (s.automation) score += 60;
  if (!s.signedIn && s.geo?.conn_type === "hosting") score += 30;
  if (!s.signedIn && s.device.pageViews >= 5 && !s.device.inputSeen) score += 20;
  score += Math.min(40, s.device.rateHits * 20);
  // A signed-in human session is strong evidence against.
  if (s.signedIn && !s.ua.is_bot_ua && !s.automation) score = Math.min(score, 20);
  return Math.min(100, score);
};

export const isBot = (device: DeviceInfo, threshold: number) =>
  device.botOverride === "bot" || (device.botOverride !== "human" && device.botScore >= threshold);
