// Topic glyphs for AI summary items, chosen from the item's signal key so each card shows what it is about.

export type SignalTopic =
  | "air-temperature"
  | "polar-temperature"
  | "sea-surface"
  | "sea-ice"
  | "snow"
  | "glacier"
  | "sea-level"
  | "energy"
  | "greenhouse-gas"
  | "enso"
  | "signal";

const WAVE_PATH = "M3 20.5c1.5 0 1.5-1.4 3-1.4s1.5 1.4 3 1.4 1.5-1.4 3-1.4 1.5 1.4 3 1.4 1.5-1.4 3-1.4 1.5 1.4 3 1.4";

export function signalTopic(signalKey: string, tone: "heat" | "ice" | "ocean" | "signal"): SignalTopic {
  const key = signalKey.toLowerCase();
  if (key.includes("sea_ice")) return "sea-ice";
  if (key.includes("snow")) return "snow";
  if (key.includes("glacier") || key.includes("ice_sheet")) return "glacier";
  if (key.includes("sea_level")) return "sea-level";
  if (key.includes("enso") || key.includes("nino")) return "enso";
  if (key.includes("sea_surface") || key.includes("ocean_heat")) return "sea-surface";
  if (key.includes("energy") || key.includes("solar")) return "energy";
  if (key.startsWith("atmospheric_")) return "greenhouse-gas";
  if (key.startsWith("arctic_") || key.startsWith("antarctic_")) return "polar-temperature";
  if (key.includes("temperature")) return "air-temperature";
  return tone === "ice" ? "sea-ice" : tone === "ocean" ? "sea-surface" : tone === "heat" ? "air-temperature" : "signal";
}

export function SignalIcon({ topic }: { topic: SignalTopic }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  switch (topic) {
    case "air-temperature":
      // Thermometer with a sun.
      return (
        <svg {...common}>
          <path d="M6.5 4.5a2 2 0 0 1 4 0v8.6a3.8 3.8 0 1 1-4 0Z" />
          <path d="M8.5 9v7" />
          <circle cx="18" cy="7.5" r="2.4" />
          <path d="M18 2.5v1M18 11.5v1M13.5 7.5h1M21.5 7.5h1" />
        </svg>
      );
    case "polar-temperature":
      // Thermometer with a snowflake.
      return (
        <svg {...common}>
          <path d="M6.5 4.5a2 2 0 0 1 4 0v8.6a3.8 3.8 0 1 1-4 0Z" />
          <path d="M8.5 9v7" />
          <path d="M18 3.5v8M14.5 5.5l7 4M14.5 9.5l7-4" />
        </svg>
      );
    case "sea-surface":
      // Thermometer above the waterline.
      return (
        <svg {...common}>
          <path d="M10 2.5a2 2 0 0 1 4 0v6.3a3.3 3.3 0 1 1-4 0Z" />
          <path d="M12 6v5" />
          <path d={WAVE_PATH} />
        </svg>
      );
    case "sea-ice":
      // Ice floe floating on the water.
      return (
        <svg {...common}>
          <path d="M3 15.5h8.5L10 11.5H5Z" />
          <path d="M13.5 15.5H21l-2-5.5h-4.5Z" />
          <path d={WAVE_PATH} />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
          <path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" />
        </svg>
      );
    case "glacier":
      // Mountain with an ice cap.
      return (
        <svg {...common}>
          <path d="M2.5 20 9.5 7l3.5 6 2.5-3.5L21.5 20Z" />
          <path d="m6.8 12 1.6 1.2 1.4-1.4 1.4 1.4 1.6-1.2" />
        </svg>
      );
    case "sea-level":
      // Rising water.
      return (
        <svg {...common}>
          <path d="M12 3v10M8.5 6.5 12 3l3.5 3.5" />
          <path d="M3 16c1.5 0 1.5-1.4 3-1.4s1.5 1.4 3 1.4 1.5-1.4 3-1.4 1.5 1.4 3 1.4 1.5-1.4 3-1.4 1.5 1.4 3 1.4" />
          <path d={WAVE_PATH} />
        </svg>
      );
    case "energy":
      // Sunlight arriving at the Earth.
      return (
        <svg {...common}>
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M12 2.5v7.5M8.8 6.8 12 10l3.2-3.2" />
          <path d="M5.5 6 7 7.5M18.5 6 17 7.5" />
        </svg>
      );
    case "greenhouse-gas":
      // CO2-style molecule.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.9" />
          <circle cx="3.9" cy="12" r="1.9" />
          <circle cx="20.1" cy="12" r="1.9" />
          <path d="M5.8 10.9h3.3M5.8 13.1h3.3M14.9 10.9h3.3M14.9 13.1h3.3" />
        </svg>
      );
    case "enso":
      // Breaking Pacific wave.
      return (
        <svg {...common}>
          <path d="M3 16.5C6.5 16.5 7 7 12.5 7c3 0 4.5 2 4.5 4s-1.4 3-2.8 3-2.2-1-2.2-2.2" />
          <path d={WAVE_PATH} />
        </svg>
      );
    case "signal":
    default:
      return (
        <svg {...common}>
          <path d="M3 12h4l3-7 4 14 3-7h4" />
        </svg>
      );
  }
}
