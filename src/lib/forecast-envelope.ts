export type ForecastPayload = {
  AnalysisPeriodTotal?: number;
  ProjectedTotal?: number;
  DailyAverage?: number;
  Notes?: string;
  CalculatedAt?: string;
};

type Envelope = {
  Success?: boolean;
  Result?: ForecastPayload | null;
  Error?: { Type?: string; Message?: string; Details?: string | null } | null;
};

export type ParsedForecast =
  | { ok: true; payload: ForecastPayload }
  | { ok: false; error: string };

const MAX_RAW_ERROR_LENGTH = 200;

/**
 * The PowerOffice MCP `forecast` tool replies with either the legacy flat
 * payload ({ AnalysisPeriodTotal, ... }) or, since 2026-09, an envelope
 * ({ Success, Result, Error }). The success-envelope shape is assumed from the
 * error shape observed live; a successful envelope has not been observed yet.
 */
export function parseForecastEnvelope(text: string): ParsedForecast {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: text.trim().slice(0, MAX_RAW_ERROR_LENGTH) || "Empty response" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Unexpected response shape" };
  }
  const env = parsed as Envelope;
  if (typeof env.Success !== "boolean") {
    return { ok: true, payload: parsed as ForecastPayload };
  }
  if (env.Success && env.Result && typeof env.Result === "object") {
    return { ok: true, payload: env.Result };
  }
  const message = env.Error?.Message ?? "Forecast tool returned no result";
  const details = env.Error?.Details;
  return { ok: false, error: details ? `${message} — ${details}` : message };
}
