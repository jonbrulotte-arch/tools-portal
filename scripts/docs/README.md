# Help & Docs: sample data and screenshots

The guides in `src/content/help/` use screenshots taken from a **separate demo database** filled with sample data: demo users at `@demo.example`, partners at `partner.example`, demo Shopify stores, and the stand-in servers below. Never point these scripts at the production database. `seed-demo.ts` refuses to run unless the database name contains `docs` or `demo`.

## 1. Demo database

```bash
createdb -h localhost -U portal tools_portal_docs
export DATABASE_URL=postgresql://portal:portal@localhost:5432/tools_portal_docs
npx prisma migrate deploy
```

## 2. Stand-in servers (no real email is sent, no real Salsify call is made)

```bash
mkdir -p /tmp/docs-demo && echo '{"columns":[],"rows":[]}' > /tmp/docs-demo/rows.json
python3 scripts/docs/stand_in_graph.py /tmp/docs-demo &     # Microsoft Graph on 127.0.0.1:8097
python3 scripts/docs/stand_in_salsify.py &                  # Salsify list on 127.0.0.1:8098
python3 scripts/docs/stand_in_mango.py &                    # Mango inventory pages on 127.0.0.1:8096
```

The same variables point the app and the seed at them:

```bash
export AUTO_EMAILS_SQL_STUB=/tmp/docs-demo/rows.json \
  GRAPH_LOGIN_BASE=http://127.0.0.1:8097 GRAPH_API_BASE=http://127.0.0.1:8097 \
  SALSIFY_API_BASE=http://127.0.0.1:8098/api/v1
```

`AUTO_EMAILS_SQL_STUB` replaces the SQL Server query with the rows in that JSON file. The seed writes sample partner rows into it.

## 3. Seed

```bash
DOCS_SHIP_REPORT=/path/to/a/ship-cost-report.xlsx npx tsx scripts/docs/seed-demo.ts
```

`DOCS_SHIP_REPORT` is optional: a ship cost history export for the Shipping Rates Generator's Analysis. Only totals by zone and weight appear in screenshots; names and addresses aren't stored. All demo users have the password `DemoPassword2026`:

| User | Role | Used for |
| --- | --- | --- |
| admin@demo.example | Super Admin | Admin guides, Shopify stores |
| edi.admin@demo.example | EDI Admin | EDI Admin SOP, Getting started |
| edi.viewer@demo.example | EDI Viewer | Reading the email log |
| cs.rep@demo.example | Customer Service | Shopify SOP |
| logistics@demo.example | Logistics | Shipping guides |

## 4. Run the app and take the screenshots

```bash
npm run build && DISABLE_SCHEDULER=true npx next start -p 8016 &
node scripts/docs/screenshots.mjs                    # every doc
node scripts/docs/screenshots.mjs auto-emails-admin  # or just one group
```

Screenshots are written to `src/content/help/images/<doc>/` as JPEGs (1440×900 at 1.25×). Check the images, then commit them with the Markdown changes.

## Editing a guide

- Text: edit `src/content/help/<slug>.md` (GitHub-flavoured Markdown). `##` headings make the "On this page" list. A blockquote starting with `Note:`, `Tip:` or `Warning:` becomes a coloured callout. Reference images as `![Caption](images/name.jpg)`.
- New guide: add an entry to `src/lib/help/registry.ts` with its audience (`everyone`, `tool`, `toolManager` or an admin `permission`), then its `.md` file. Bump `updated` when a guide changes.
- `npm test` checks that every registered guide has a file and every image it references exists.
