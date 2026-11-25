For admins with the **View access log** permission. The **Access log** records who did what, and when, across the whole platform.

![Access log](images/access-log.jpg)

## What's recorded

- **Sign-ins**: successful and failed sign-ins, lockouts, password resets.
- **Changes**: every create, edit and delete in users, roles, tools, settings and backups, and in the tools themselves (for example `auto_email.updated`, `shopify.discount_created`).
- **Denied access**: someone opening a page or API they aren't allowed to use, including Help & Docs guides they can't see.
- **Automatic jobs**: scheduled sends, imports and backups, recorded with the job's name as the user.

## Finding something

- **Search**: matches text such as the action or someone's email, for example `auto_email`.
- **From / To**: the date range.
- **Category**: AUTH, USER, ROLE, TOOL, SETTINGS, BACKUP, SHOPIFY, NAV (pages opened or denied), AUDIT or SYSTEM.
- **Result**: success or failure.

Click **View details** (eye icon) to see everything recorded with an entry (what changed, the error, the IP address and browser). **Export CSV** saves the filtered entries for an audit.

> Tip: For "who changed this automated email?", search `auto_email` and open the matching `auto_email.updated` entry.

Secrets (passwords, API keys) are never written to the log.
