/**
 * A small, dependency-free user-agent parser. It covers what reports need: browser
 * family and major version, OS family and version, device class, and known bots.
 * Order matters: Edge/Opera/Samsung identify as Chrome too, so they are tested first.
 */
export interface ParsedUa {
  browser: string | null;
  browser_ver: string | null;
  os: string | null;
  os_ver: string | null;
  device_type: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  is_bot_ua: boolean;
}

/** Crawlers, scripted clients, headless browsers and link-preview fetchers. */
export const BOT_UA_RE =
  /bot\b|crawl|spider|slurp|bingpreview|mediapartners|facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|embedly|quora link preview|pinterest|vkshare|w3c_validator|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww|node-fetch|axios\/|postmanruntime|insomnia|headlesschrome|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|uptimerobot|pingdom|statuscake|site24x7|ahrefs|semrush|mj12bot|dotbot|petalbot|yandex|baiduspider|duckduckbot|applebot|gptbot|chatgpt-user|claudebot|anthropic-ai|ccbot|bytespider|amazonbot|dataforseo|censys|zgrab|masscan|nmap/i;

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /(?:OPR|Opera)\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["UC Browser", /UCBrowser\/(\d+)/],
  ["Opera Mini", /Opera Mini\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ["IE", /(?:MSIE |Trident\/.*rv:)(\d+)/],
];

const OSES: [string, RegExp, ((m: RegExpMatchArray) => string | null)?][] = [
  ["Windows", /Windows NT (\d+\.\d+)/, (m) => ({ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" } as any)[m[1]] ?? m[1]],
  ["iOS", /(?:iPhone|iPad|iPod).*? OS (\d+)[_\d]*/, (m) => m[1]],
  ["Android", /Android (\d+(?:\.\d+)?)/, (m) => m[1]],
  ["ChromeOS", /CrOS/],
  ["macOS", /Mac OS X (\d+)[_.](\d+)/, (m) => `${m[1]}.${m[2]}`],
  ["Linux", /Linux/],
];

export const parseUa = (ua: string | null | undefined): ParsedUa => {
  const s = (ua || "").slice(0, 512);
  if (!s) return { browser: null, browser_ver: null, os: null, os_ver: null, device_type: "unknown", is_bot_ua: false };
  const isBot = BOT_UA_RE.test(s);

  let browser: string | null = null;
  let browser_ver: string | null = null;
  for (const [name, re] of BROWSERS) {
    const m = s.match(re);
    if (m) {
      browser = name;
      browser_ver = m[1] ?? null;
      break;
    }
  }

  let os: string | null = null;
  let os_ver: string | null = null;
  for (const [name, re, ver] of OSES) {
    const m = s.match(re);
    if (m) {
      os = name;
      os_ver = ver ? ver(m) : null;
      break;
    }
  }
  // iPadOS 13+ claims to be a Mac; the Mobile token gives it away.
  if (os === "macOS" && /Mobile\//.test(s)) os = "iOS";

  let device_type: ParsedUa["device_type"] = "desktop";
  if (isBot) device_type = "bot";
  else if (/iPad|Tablet|SM-T\d|Tab(?:let)?\b/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) device_type = "tablet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Opera Mini|IEMobile/.test(s)) device_type = "mobile";
  else if (!browser && !os) device_type = "unknown";

  return { browser, browser_ver, os, os_ver, device_type, is_bot_ua: isBot };
};
