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
