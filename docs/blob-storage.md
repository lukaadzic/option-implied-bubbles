# Publishing estimator output

**You do not need this to run the dashboard.** The blob store is public and
read-only, so `bun install && bun run dev` works with no token and no account.
This page is only for replacing the data with new estimator output.

## How the data is addressed

Two files per ticker, named by convention rather than tracked in a mapping:

```
bubble_data_<TICKER>_splitadj_1996to2023.json   estimates + split-adjusted prices
<TICKER>_data.json                              raw, as-traded prices
```

`src/utils/dataLoader.ts` builds both URLs from the ticker and a single host
constant. Adding a ticker means adding it to `STOCK_LIST` and `STOCK_NAMES` in
`src/types/bubbleData.ts` and uploading files under those names. There is no URL
list to keep in sync.

## Uploading

1. Create a Blob store in the Vercel dashboard under **Storage → Create →
   Blob**.

2. Copy `BLOB_READ_WRITE_TOKEN` from the store's settings into `.env.local`:

   ```bash
   cp .env.example .env.local
   # then paste the token
   ```

   `.env.local` is gitignored. Do not commit it.

3. Put the JSON files in `public/data/`, named as above, and upload:

   ```bash
   bun run upload-data
   ```

4. If the store is new, its host differs from the one in the repo. Update
   `BLOB_HOST` in `src/utils/dataLoader.ts` to match. `bun run get-blob-urls`
   prints what is actually in the store.

5. Rebuild the cross-asset panel, which is derived from the per-ticker files and
   committed to the repo:

   ```bash
   bun run build:cross-asset
   ```

6. Check it worked:

   ```bash
   bun run test-blob
   bun run dev
   ```

## Notes

- Blob URLs are public but unguessable. Anyone with the link can read; only the
  token can write. Keep the token out of the client bundle, which is why the
  upload scripts run in Node and not in the app.
- Files are served with `cache-control: public, max-age=2592000`. A new upload
  at the same path takes up to 30 days to displace a cached copy in a given
  region, so during testing change the filename rather than fighting the cache.
- The per-ticker files are roughly 12MB each and are **not** compressed in
  transit. That is the dominant cost of loading the dashboard and the reason
  the cross-asset panel uses a separate 220KB derivative instead.
- Do not upload raw OptionMetrics option data. The derived series can be
  published under this repository's licence; the underlying data cannot.
