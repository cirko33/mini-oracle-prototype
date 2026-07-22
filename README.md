# mini-oracle-prototype

A tiny price oracle. On a fixed interval it polls the last price and 24h volume
for DOT and USDT from a set of exchange REST APIs, then appends one line of
NDJSON per asset per tick.

DOT/USD(T) prices go to `dotprice.ndjson`, covering 15 venues. USDT/USD prices
go to `usdprice.ndjson`, covering 6 venues.

Each line looks like this:

```json
{"ts": 1721563200000, "binance": {"price": 4.12, "volume": 1234567.8}, "okx": {"price": 4.11, "volume": 987654.3}}
```

`ts` is the Unix timestamp in milliseconds. Every venue gets its own object with
`price` and `volume`. If a fetch fails or a field is missing, that value comes
back as `null` instead of crashing the run.

## Requirements

* Rust with an edition 2024 toolchain, so 1.85 or newer. Grab it from
  [rustup.rs](https://rustup.rs) if you don't have it.
* An internet connection, since it hits live exchange APIs.

## Build

```sh
cargo build --release
```

## Run

The one required flag is `--interval-ms`, the polling interval in milliseconds.
To poll every 5 seconds:

```sh
cargo run --release -- --interval-ms 5000
```

The short form works too:

```sh
cargo run --release -- -i 5000
```

The program runs forever. It writes a new line to each file on every tick, so
leave it going and stop it with `Ctrl+C` when you have enough data. The
`.ndjson` files are created automatically in the current directory and appended
to, so restarting keeps your earlier data.

If a single venue or asset fails on a tick, it logs the error to stderr and
keeps going.

## Output files

* `dotprice.ndjson`: one line per tick, DOT prices across all DOT venues.
* `usdprice.ndjson`: one line per tick, USDT prices across all USD venues.

Since it's NDJSON, one JSON object per line, you can process it with anything
that reads line by line. For example, pull binance's DOT price from each line
with `jq`:

```sh
jq -c '{ts, binance}' dotprice.ndjson
```

## Run as a service (Linux)

To keep the poller running in the background on a Linux server, there's a
systemd unit in `deploy/`. On the target machine, from the repo root:

```sh
sudo deploy/install.sh
```

That builds the release binary, creates a dedicated `mini-oracle` system user
and a data directory at `/var/lib/mini-oracle`, installs the binary to
`/usr/local/bin/mini-oracle` and the unit to
`/etc/systemd/system/mini-oracle.service`, then enables and starts it. The
service polls every 10s (`--interval-ms 10000`) and restarts automatically on
crash or reboot.

```sh
systemctl status mini-oracle      # is it running
journalctl -u mini-oracle -f      # follow logs
ls -l /var/lib/mini-oracle        # the .ndjson files land here
```

To change the interval, edit `ExecStart` in
`/etc/systemd/system/mini-oracle.service`, then
`sudo systemctl daemon-reload && sudo systemctl restart mini-oracle`. Re-running
`deploy/install.sh` upgrades the binary and unit in place. Stop and remove with
`sudo systemctl disable --now mini-oracle`.

## Dashboard

`scripts/` holds an interactive dashboard that turns the collected ticks into an
oracle price: it normalizes every venue to USD, drops stale, thin, and outlier
prints, and takes a volume-weighted average (VWAP) of what's left. It's a React
app built with Vite and run through Bun, and it reads the `.ndjson` files from
the repo root live (a small dev-server middleware serves them).

Requirements: [Bun](https://bun.sh). Run the poller first (see above) so there's
data to chart.

```sh
cd scripts
bun install
bun run dev
```

Then open the URL Vite prints (http://localhost:3000). Leaving the poller running
and refreshing the page picks up new ticks.

What you get:

* Three filters, each recomputing the survivors and the VWAP live: a staleness
  window (0 to 24h), a minimum share of total volume (0 to 100%, defaults to the
  1% rule), and a MAD outlier threshold.
* A VWAP-over-time chart. The live curve tracks the sliders as you move them.
  Hit **Plot** to freeze the current config as a colored curve and keep going on
  a fresh live one; layer several to compare filter settings. **Hide current**
  drops the live curve so you can look at just the frozen ones, and **Clear**
  removes them.

Notes on the math:

* Prices from `coinbase`, `kraken`, and `crypto.com` are treated as USD. Every
  other venue is USDT-quoted and gets multiplied by a USDT/USD index built from
  `usdprice.ndjson` (VWAP of its venues) at the matching `ts`.
* `digifinex` volume is base (DOT), so it's converted to USD-notional before any
  weighting. See the volume note below.

Run the pipeline's unit tests with `bun test` from `scripts/`.

## Notes

* The venue list and the JSON field paths live in `src/venues.rs`. The
  `dotprice.md` and `usdprice.md` files are where those URLs and field mappings
  came from.
* Volumes are reported as quote (USD) volume where possible. A couple of venues
  only give base volume, so it gets multiplied by price to get there. Digifinex
  is the exception and reports base volume in DOT. That's noted in the code.
