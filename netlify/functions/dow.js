// Netlify serverless function to fetch DOW price via Finnhub
// Uses DIA ETF (tracks DOW) and converts to approximate DOW value
// Tracks last time above 50K using Netlify Blobs

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  if (!FINNHUB_KEY) {
    return new Response(
      JSON.stringify({ error: "FINNHUB_API_KEY not configured", dow: null }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch DIA ETF quote (SPDR Dow Jones Industrial Average ETF)
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=DIA&token=${FINNHUB_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Finnhub returned ${response.status}`);
    }

    const data = await response.json();

    // DIA tracks DOW at roughly 1/100th the value
    const DIA_TO_DOW_RATIO = 99.91;

    const dowEstimate = data.c * DIA_TO_DOW_RATIO;
    const dowPrevClose = data.pc * DIA_TO_DOW_RATIO;
    const dowOpen = data.o * DIA_TO_DOW_RATIO;
    const dowHigh = data.h * DIA_TO_DOW_RATIO;
    const dowLow = data.l * DIA_TO_DOW_RATIO;

    // Track last time above 50K using Netlify Blobs
    const store = getStore("dow-tracker");
    let lastAbove50k = null;

    if (dowEstimate >= 50000) {
      // Currently above 50K — save this timestamp
      const now = new Date().toISOString();
      await store.set("lastAbove50k", now);
      lastAbove50k = now;
    } else {
      // Below 50K — read the last time it was above
      try {
        lastAbove50k = await store.get("lastAbove50k");
      } catch (e) {
        lastAbove50k = null;
      }

      // Fallback if no record exists yet
      if (!lastAbove50k) {
        lastAbove50k = "2026-02-11T20:00:00.000Z";
      }
    }

    const result = {
      dow: Math.round(dowEstimate * 100) / 100,
      previousClose: Math.round(dowPrevClose * 100) / 100,
      open: Math.round(dowOpen * 100) / 100,
      high: Math.round(dowHigh * 100) / 100,
      low: Math.round(dowLow * 100) / 100,
      change: Math.round((dowEstimate - dowPrevClose) * 100) / 100,
      changePercent: Math.round(((dowEstimate - dowPrevClose) / dowPrevClose) * 10000) / 100,
      timestamp: data.t,
      above50k: dowEstimate >= 50000,
      lastAbove50k: lastAbove50k,
      source: "Finnhub (DIA ETF estimate)",
      raw_dia: data.c,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=15",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, dow: null }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};

export const config = {
  path: "/api/dow",
};
