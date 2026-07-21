//! Exchange venue definitions and their per-venue price/volume extractors.
//!
//! The URLs and JSON field paths come from `dotprice.md` and `usdprice.md`.
//! Each `Venue` knows how to pull the last price and the 24h volume out of that
//! exchange's ticker response.

use serde_json::Value;

pub struct Venue {
    /// Lowercased venue name — used verbatim as the JSON key in the output line.
    pub key: &'static str,
    /// GET URL from the `.md` spec.
    pub url: &'static str,
    /// Pull the last price out of the parsed JSON response.
    pub price: fn(&Value) -> Option<f64>,
    /// Pull the 24h volume out of the parsed JSON response (quote/USD unless noted).
    pub volume: fn(&Value) -> Option<f64>,
}

/// Read a JSON value as an `f64`, accepting either a JSON number or a numeric
/// string (exchanges disagree on which they return). Any missing path indexes to
/// `Value::Null`, which yields `None` here — so a wrong path degrades to a `null`
/// field in the output rather than panicking.
fn as_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

/// Multiply two optional numbers, propagating `None` (used where an exchange only
/// reports base volume, so quote volume = base × price).
fn mul(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    Some(a? * b?)
}

/// Kraken renames pair keys unpredictably, so read the first (only) entry of the
/// `result` object rather than hardcoding the pair name.
fn kraken_ticker(v: &Value) -> Option<&Value> {
    v.get("result")?.as_object()?.values().next()
}
fn kraken_price(v: &Value) -> Option<f64> {
    as_f64(&kraken_ticker(v)?["c"][0])
}
fn kraken_volume(v: &Value) -> Option<f64> {
    let t = kraken_ticker(v)?;
    // v[1] is 24h base volume; × close price → quote volume.
    mul(as_f64(&t["v"][1]), as_f64(&t["c"][0]))
}

/// DOT/USD(T) venues — 15 exchanges from `dotprice.md`.
pub static DOT_VENUES: &[Venue] = &[
    Venue {
        key: "binance",
        url: "https://api.binance.com/api/v3/ticker/24hr?symbol=DOTUSDT",
        price: |v| as_f64(&v["lastPrice"]),
        volume: |v| as_f64(&v["quoteVolume"]),
    },
    Venue {
        key: "okx",
        url: "https://www.okx.com/api/v5/market/ticker?instId=DOT-USDT",
        price: |v| as_f64(&v["data"][0]["last"]),
        volume: |v| as_f64(&v["data"][0]["volCcy24h"]),
    },
    Venue {
        key: "coinbase",
        url: "https://api.exchange.coinbase.com/products/DOT-USD/ticker",
        price: |v| as_f64(&v["price"]),
        // `volume` is base; × price → quote volume.
        volume: |v| mul(as_f64(&v["volume"]), as_f64(&v["price"])),
    },
    Venue {
        key: "kraken",
        url: "https://api.kraken.com/0/public/Ticker?pair=DOTUSD",
        price: kraken_price,
        volume: kraken_volume,
    },
    Venue {
        key: "bitget",
        url: "https://api.bitget.com/api/v2/spot/market/tickers?symbol=DOTUSDT",
        price: |v| as_f64(&v["data"][0]["lastPr"]),
        volume: |v| as_f64(&v["data"][0]["quoteVolume"]),
    },
    Venue {
        key: "bybit",
        url: "https://api.bybit.com/v5/market/tickers?category=spot&symbol=DOTUSDT",
        price: |v| as_f64(&v["result"]["list"][0]["lastPrice"]),
        volume: |v| as_f64(&v["result"]["list"][0]["turnover24h"]),
    },
    Venue {
        key: "mexc",
        url: "https://api.mexc.com/api/v3/ticker/24hr?symbol=DOTUSDT",
        price: |v| as_f64(&v["lastPrice"]),
        volume: |v| as_f64(&v["quoteVolume"]),
    },
    Venue {
        key: "kucoin",
        url: "https://api.kucoin.com/api/v1/market/stats?symbol=DOT-USDT",
        price: |v| as_f64(&v["data"]["last"]),
        volume: |v| as_f64(&v["data"]["volValue"]),
    },
    Venue {
        key: "crypto.com",
        url: "https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=DOT_USD",
        // `a` is the latest trade price; `c` (used by the .md) is the 24h change.
        price: |v| as_f64(&v["result"]["data"][0]["a"]),
        volume: |v| as_f64(&v["result"]["data"][0]["vv"]),
    },
    Venue {
        key: "weex",
        url: "https://api-spot.weex.com/api/v2/market/ticker?symbol=DOTUSDT_SPBL",
        price: |v| as_f64(&v["data"]["lastPrice"]),
        volume: |v| as_f64(&v["data"]["value"]),
    },
    Venue {
        key: "toobit",
        url: "https://api.toobit.com/quote/v1/ticker/24hr?symbol=DOTUSDT",
        // Response is a bare array of tickers; `c` = close/last price, `qv` = quote volume.
        price: |v| as_f64(&v[0]["c"]),
        volume: |v| as_f64(&v[0]["qv"]),
    },
    Venue {
        key: "whitebit",
        url: "https://whitebit.com/api/v1/public/ticker?market=DOT_USDT",
        // Fields are directly under result (there is no `ticker` sub-object).
        price: |v| as_f64(&v["result"]["last"]),
        volume: |v| as_f64(&v["result"]["deal"]),
    },
    Venue {
        key: "digifinex",
        url: "https://openapi.digifinex.com/v3/ticker?symbol=dot_usdt",
        price: |v| as_f64(&v["ticker"][0]["last"]),
        // NOTE: base_vol is BASE volume (in DOT), per the .md — not quote/USD like the others.
        volume: |v| as_f64(&v["ticker"][0]["base_vol"]),
    },
    Venue {
        key: "bitmart",
        url: "https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=DOT_USDT",
        price: |v| as_f64(&v["data"]["last"]),
        volume: |v| as_f64(&v["data"]["qv_24h"]),
    },
    Venue {
        key: "p2b",
        url: "https://api.p2pb2b.com/api/v2/public/ticker?market=DOT_USDT",
        price: |v| as_f64(&v["result"]["last"]),
        volume: |v| as_f64(&v["result"]["deal"]),
    },
];

/// USDT/USD venues — 6 exchanges from `usdprice.md`.
pub static USD_VENUES: &[Venue] = &[
    Venue {
        key: "binance",
        url: "https://api.binance.com/api/v3/ticker/24hr?symbol=USDTUSD",
        price: |v| as_f64(&v["lastPrice"]),
        volume: |v| as_f64(&v["quoteVolume"]),
    },
    Venue {
        key: "okx",
        url: "https://www.okx.com/api/v5/market/ticker?instId=USDT-USD",
        price: |v| as_f64(&v["data"][0]["last"]),
        volume: |v| as_f64(&v["data"][0]["volCcy24h"]),
    },
    Venue {
        key: "coinbase",
        url: "https://api.exchange.coinbase.com/products/USDT-USD/ticker",
        price: |v| as_f64(&v["price"]),
        // `volume` is base; × price → quote volume.
        volume: |v| mul(as_f64(&v["volume"]), as_f64(&v["price"])),
    },
    Venue {
        key: "bitget",
        url: "https://api.bitget.com/api/v2/spot/market/tickers?symbol=USDTUSD",
        price: |v| as_f64(&v["data"][0]["lastPr"]),
        volume: |v| as_f64(&v["data"][0]["quoteVolume"]),
    },
    Venue {
        key: "bybit",
        url: "https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDTUSD",
        price: |v| as_f64(&v["result"]["list"][0]["lastPrice"]),
        volume: |v| as_f64(&v["result"]["list"][0]["turnover24h"]),
    },
    Venue {
        key: "crypto.com",
        url: "https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=USDT_USD",
        // `a` is the latest trade price; `c` (used by the .md) is the 24h change.
        price: |v| as_f64(&v["result"]["data"][0]["a"]),
        volume: |v| as_f64(&v["result"]["data"][0]["vv"]),
    },
];
