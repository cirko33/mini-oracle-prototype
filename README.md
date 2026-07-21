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

## Notes

* The venue list and the JSON field paths live in `src/venues.rs`. The
  `dotprice.md` and `usdprice.md` files are where those URLs and field mappings
  came from.
* Volumes are reported as quote (USD) volume where possible. A couple of venues
  only give base volume, so it gets multiplied by price to get there. Digifinex
  is the exception and reports base volume in DOT. That's noted in the code.
