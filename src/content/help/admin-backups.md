For admins with the **Backup & restore** permission. A backup is a full copy of every user, role, setting, tool record and log on the platform.

![Backup & Restore](images/backups.jpg)

## Backups

- **Scheduled**: automatic, for example daily at 02:00, keeping the last 14. Change this under **Admin → Settings → Backup schedule**.
- **Create backup now**: before a big change, such as an upgrade or a bulk role change.
- **Download** (arrow icon): saves the `.json.gz` file. Download one regularly and keep it somewhere safe **off the server**.

The Type column shows *scheduled*, *manual*, *pre-restore* or *upload*.

> Warning: Stored secrets (Microsoft Graph, Shopify, the SQL login, API keys) stay **encrypted** inside backups. A backup can be restored only on a server with the same `APP_ENCRYPTION_KEY`. Keep a safe copy of that key, separately from the backups.

## Restoring

1. Click **Restore this backup** on a row, or **Restore from file** to upload a downloaded backup.
2. Type **RESTORE** to confirm.
3. The platform first saves a **pre-restore** backup of the current data, so a restore can itself be undone, then replaces everything with the backup's contents.
4. Everyone, you included, is signed out and signs in again.

Restore replaces **all** data with the backup's: anything created after the backup was taken (users, discounts, automated emails, logs) is lost, except in the pre-restore backup.
