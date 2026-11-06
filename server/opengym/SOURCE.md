# openGym API source

Upstream: https://github.com/DuarteSantos8/openGym

Commit supplied in the handoff manifest: `b6cfe2bbd3f099523ffbf2677438864e9a09a06f`.
Version: gym-api 1.4.3. Copyright (C) 2026 Duarte Santos. AGPL-3.0-or-later.

Copied from the supplied `backend/openGym/api/` source: root JavaScript modules,
Dockerfile, package.json/package-lock.json, openapi.yaml, and coach/ (statically imported even
when Coach is disabled). The optional provider SDK is not needed for account/sync operation.
Packaging-only changes: the default Docker target additionally copies the retained LICENSE and
NOTICE into the runtime image; `.dockerignore` excludes dependencies, private runtime data and
media. Root JavaScript modules remain byte-identical to the supplied source.
LICENSE and NOTICE.md are retained from upstream. No source data directory, credentials,
.env, browser profile, node_modules, frontend, catalogue, website, web image, or media was copied.

The account adapter stores this application's validated shared Snapshot under
`state.jianlibao = {version: 1, snapshot}`. All other server fields are retained. This is a
lossless transport for IRONLAW records, not direct interchange with upstream openGym's UI.
Native openGym workouts/routines/customEx/body measurements remain unmodified. Accounts and
native upstream records can coexist, but neither frontend displays the other's separate records.

Local workspace revisions, drafts, device preferences, onboarding, media and Netlify sync keys
never enter the namespace. Full remote state and connection metadata use a separate Web
IndexedDB database; bearer tokens use a separate object store in that database and never appear
in ordinary exports. The native application does not enable this feature or store these tokens.

Runtime account state is server-readable JSON. This optional provider does not claim Netlify's
end-to-end encryption. Network use requires explicit selection of the self-hosted provider.

Gym visual exercise images/videos are separately restricted and completely excluded from this
integration. The retained upstream NOTICE refers to upstream components; its presence does not
mean those assets are distributed here. Do not use upstream prebuilt web images for this app.
