# Happykai preview deployment

These files accompany the existing read-only Chinese preview. They contain no
dashboard password, exchange credentials, SSH key or private authentication data.
The selected design-v2 desktop layout is maintained separately from upstream `main`
on `happykai/preview`, with the design also available on `ui/design-v2`.
The original selected preview directory has been archived outside the public root.
The existing SPA fallback serves the default panel at its old URL. Historical
backups and proxy configuration remain untouched. The previous cockpit remains
at `/preview/legacy-fixed-cockpit/index.html`. Build the default entry with the
checked-in `/preview/` base and keep the existing read-only gateway.

## Files

- `compose.preview.yaml`: an additional service on an existing Freqtrade Compose
  project; no public host port is added.
- `Preview.Caddyfile`: serves built assets and permits a fixed list of authenticated
  read endpoints; the fixed spot-market proxy strips authentication before Binance.
- `Public.Caddyfile.example`: example routes for an existing public Caddy instance;
  inspect and adapt the hostname/service names before using it.
- `verify_preview.py`: run on the configured Japan node; reads dashboard credentials
  there and prints only safe validation results.
- `rollback_preview.py`: validates and restores a supplied pre-preview Caddy backup,
  hot reloads the proxy and stops only the preview service. It retains application
  data and files.

The Python scripts intentionally check the configured host and deployment paths.
Adapt them before use on another node. Do not copy private authentication files
into this repository.

## Existing deployment layout

```text
/opt/binance-quant/
  compose.yaml                 # existing Freqtrade/public Caddy project
  compose.preview.yaml         # from this folder
  Caddyfile                    # existing public proxy, backed up before editing
  private/                     # existing private files; never versioned
  trellis/
    Preview.Caddyfile
    public/                    # contents of the frontend dist/ plus MIT provenance
```

Build locally with the frozen lockfile, validate the static bundle, preserve a
timestamped backup of the current static release and then publish only the
build output. Only the preview service should be recreated if its bind mount
needs to be changed. Existing Freqtrade and public Caddy must not be recreated.

For a static-only update with the existing directory bind mount, keep that
directory in place. Back up `public/` to a timestamped sibling, copy the new
hashed assets while retaining old ones, and replace `index.html` last. No
container restart or proxy reload is needed. To roll back this type of update,
atomically restore the backup's `index.html`; keep both sets of assets so open
sessions continue to work. `rollback_preview.py` removes the entire preview
route and is intended for reverting the initial deployment, not a style update.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

Validate both Compose files together before service changes. Validate the existing
public proxy configuration before hot reloading it. Do not use the upstream
generic proxy/server examples for this deployment.

## Historical strategy comparisons

`/preview/backtests/*` is served from the existing static container through a dedicated
authenticated, GET/HEAD-only route on the public Caddy. The original bot gateway
allowlist is unchanged. The frontend reads completed research reports; it cannot
start backtest commands or change the running strategy. Build and reproduce
reports using [research/backtests](../../research/backtests/README.md).

## Independent paper accounts

`compose.paper.yaml` adds only `paper-compare` to the existing project. It has no
host port and mounts its own `paper_compare/` directory, SQLite database, strategy
and config. Reuse dashboard auth read-only; leave exchange credentials empty.
The public Caddy example adds a fixed GET-only `/preview/bots/compare/api/v1/`
gateway. Validate the candidate, write the bind-mounted live file in place and
hot reload the existing Caddy. Do not recreate existing services.

Keep two paper bots initially on this 2-core / 2GB node. `PaperCompare1h` is a
frozen research variant for forward observation, not a claim of profitability.
Preserve the baseline and its database. Each independent virtual wallet starts
at 1000 USDT: 100-USDT stake, two positions, 8% stop and 8-hour cooldown. A new
account starts its live history now; backtest gains are never imported.

The authenticated `backtests/paper-bots.json` registry lists deployed names and
only the two fixed gateways. The workspace selector changes the viewed account;
both bots continue independently. Snapshots, trades, capital settings and logs
are scoped to each bot. Switching ignores late replies and remounts account
views. Logout clears all session profiles and snapshots. Original FreqUI at `/`
continues to target the baseline.

Validate Compose overlays with `config --quiet`, then use `up -d --no-deps
paper-compare` for this service only. Run `verify_paper.py` on Japan: it reads auth
locally and checks real configs, candles, independent SQLite files, absent
exchange credentials/host ports and denied write routes. For rollback restore
the matching UI index and Caddy backup (validate/hot reload), remove the second
registry entry, and stop only the comparison service. Retain all data/backups.

## Shorter-timeframe research

[research/strategy-study](../../research/strategy-study/README.md) compares seven
fixed rule families, three timeframes and three stakes across three periods and
two costs. Original 24-run report bytes remain unchanged. Versioned reports,
trades and candles are gzip-compressed and loaded on demand in the browser via
the existing authenticated research route. Selecting a backtest row changes the
research view only and cannot replace or control a running paper strategy.

The 2026-10-31 release includes 378 formal runs (504 actual executions after
uniform terminal-data correction); see the study RESULTS and
TERMINAL-CORRECTION. `verify_study.py <deployment-record-directory>` runs on Japan
and checks every authenticated served file SHA, gzip/JSON decoding, all 378
results, original report bytes and denied writes. Credentials remain local.
Exact accepted UI/API/resource checks and deployment backup paths are retained
under `research/strategy-study/evidence/live/`. Browser runtime fixtures and real
Japan-local API assertions are recorded separately.
