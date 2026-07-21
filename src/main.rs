//! Mini price oracle: on a fixed interval, poll the last DOT and USDT prices and
//! 24h volumes from a list of exchange REST APIs and append one NDJSON line per
//! asset per tick to `dotprice.ndjson` and `usdprice.ndjson`.
//!
//! Each line looks like
//! `{"ts": <epoch_ms>, "<venue>": {"price": <f64|null>, "volume": <f64|null>}, ...}`.

mod venues;

use std::fs::OpenOptions;
use std::io::Write;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use clap::Parser;
use serde_json::{Map, Value};

use venues::{Venue, DOT_VENUES, USD_VENUES};

#[derive(Parser)]
#[command(about = "Poll DOT/USDT prices from exchange APIs into NDJSON files")]
struct Args {
    /// Polling interval in milliseconds
    #[arg(long, short)]
    interval_ms: u64,
}

/// Current Unix time in milliseconds.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before the Unix epoch")
        .as_millis() as u64
}

/// Last price and 24h volume for one venue at one tick; either field is `None`
/// when it couldn't be fetched or parsed.
struct Quote {
    price: Option<f64>,
    volume: Option<f64>,
}

/// Fetch a venue's ticker and extract its price and volume. Any failure (network,
/// non-2xx, or non-JSON body) collapses both to `None`; a missing field collapses
/// just that field.
async fn fetch_quote(client: &reqwest::Client, v: &Venue) -> Quote {
    let json: Option<Value> = async {
        let resp = client.get(v.url).send().await.ok()?.error_for_status().ok()?;
        resp.json::<Value>().await.ok()
    }
    .await;

    match json {
        Some(j) => Quote {
            price: (v.price)(&j),
            volume: (v.volume)(&j),
        },
        None => Quote {
            price: None,
            volume: None,
        },
    }
}

/// Append a single line (plus newline) to `path`, creating the file if needed.
fn append_line(path: &str, line: &str) -> std::io::Result<()> {
    let mut f = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(f, "{line}")
}

/// Fetch every venue for one asset concurrently, then append one NDJSON line
/// stamped with `ts` (the shared tick time, so both files agree per tick).
async fn poll(client: &reqwest::Client, venues: &[Venue], path: &str, ts: u64) -> anyhow::Result<()> {
    let quotes = futures::future::join_all(
        venues
            .iter()
            .map(|v| async move { (v.key, fetch_quote(client, v).await) }),
    )
    .await;

    let mut map = Map::new();
    map.insert("ts".to_string(), Value::from(ts));
    for (key, quote) in quotes {
        map.insert(
            key.to_string(),
            serde_json::json!({ "price": quote.price, "volume": quote.volume }),
        );
    }

    append_line(path, &serde_json::to_string(&Value::Object(map))?)?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let client = reqwest::Client::builder()
        .user_agent("mini-oracle-prototype/0.1")
        .timeout(Duration::from_secs(8))
        .build()?;

    let mut ticker = tokio::time::interval(Duration::from_millis(args.interval_ms));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        let ts = now_ms();
        let (dot, usd) = tokio::join!(
            poll(&client, DOT_VENUES, "dotprice.ndjson", ts),
            poll(&client, USD_VENUES, "usdprice.ndjson", ts),
        );
        if let Err(e) = dot {
            eprintln!("dot poll error: {e}");
        }
        if let Err(e) = usd {
            eprintln!("usd poll error: {e}");
        }
    }
}
