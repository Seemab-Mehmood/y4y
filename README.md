# Y4Y Directory — Youth for Youth

A global directory of youth organizations, organized by WHO region, country, province, and city — with hubs for collaboration requests and opportunity/invitation postings.

## What's included

- **Frontend** (`public/`): the SPA you uploaded (`index.html`, `css/style.css`, `js/regions-data.js`), plus a new `js/app.js` that wires every button, form, filter, and view to the backend API.
- **Backend** (`server.js`, `db.js`): a Node/Express API with JSON-file storage (no database setup required) for organizations, collaborations, and opportunities.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

That's it — frontend and backend are served from the same Express app, so there's nothing else to configure.

## How it works

- **Directory**: Browse by WHO region → country → org list, or search/filter directly. Anyone can click **Add Organization** to register theirs — region, country, and province dropdowns cascade from `regions-data.js`.
- **Collaborate**: Post a collaboration request (project, event, research, etc.); other users can click **Connect** to register interest.
- **Opportunities**: Post fellowships, grants, training, and more; users can click **Apply**.
- **Empower Hub**: Static resource cards plus live stats pulled from the database.

All submitted data is stored in `data/db.json`. Delete that file (or its contents) any time to reset the directory back to empty — the server will recreate it automatically on next start.

## API reference

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/regions` | Full WHO region/country/province dataset |
| GET | `/api/organizations` | List orgs (`region`, `countryCode`, `category`, `city`, `search`, `sort`, `page`, `limit` query params) |
| POST | `/api/organizations` | Register an organization |
| GET | `/api/organizations/:id` | Org detail |
| GET | `/api/collaborations` | List collaborations (`type` query param) |
| POST | `/api/collaborations` | Post a collaboration |
| POST | `/api/collaborations/:id/interest` | Express interest ("Connect") |
| GET | `/api/invitations` | List opportunities (`type` query param) |
| POST | `/api/invitations` | Post an opportunity |
| POST | `/api/invitations/:id/apply` | Apply to an opportunity |
| GET | `/api/stats` | Totals + per-region counts |

## Known data note

The uploaded `regions-data.js` currently lists **195** countries across the 6 WHO regions, not the full 205 the UI badge text references. The structure (`provinces`/`cities` arrays per country) is ready to take more entries — add them directly to `public/js/regions-data.js` in the same format, and the dropdowns/filters will pick them up automatically. I didn't fabricate the missing ~10 countries' provinces/cities myself, to avoid introducing inaccurate data.

## Going further

- Swap `db.js`'s JSON-file storage for Postgres/MongoDB by replacing `readDb`/`writeDb` — every route already calls only those two functions.
- Add authentication if you want organizations to edit/delete their own listings later (currently anyone can submit, nothing can be edited/deleted — by design, to keep this a quick fully-open MVP).
- Add image upload for org logos instead of a URL field.
