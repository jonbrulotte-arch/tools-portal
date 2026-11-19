For admins with the **Platform settings** permission. **Admin → Settings** has four tabs.

![Branding](images/settings.jpg)

## Branding

- **Site name** and **Accent word**: shown in the sidebar, on the sign-in page and in emails. The accent word is highlighted in blue.
- **Tagline** (optional) and the **logo** (upload an image).

## Email (Microsoft Graph)

The platform's own email: invitations and password resets. It's separate from Automated Emails (EDI), which has its own sender in that tool's settings.

![Email (Microsoft Graph)](images/settings-email.jpg)

1. IT registers an app in Entra ID with the Microsoft Graph application permission **`Mail.Send`** (admin consented), and creates a client secret.
2. Enter the **Directory (tenant) ID**, **Application (client) ID**, **Client secret**, the **Send from mailbox** and an optional **Sender display name**.
3. Save, then **Send a test email** to yourself.

The client secret is encrypted and never shown again. Leave it blank to keep the saved one. Client secrets expire (often after 6 to 24 months): note the date and renew it in Entra before it does, or invitations stop being emailed.

## Security

![Security](images/settings-security.jpg)

| Setting | Default |
| --- | --- |
| Failed sign-ins before lockout | 5 |
| Lockout duration (minutes) | 15 |
| Invitation link valid for (hours) | 72 |
| Password reset link valid for (minutes) | 60 |

## Backup schedule

![Backup schedule](images/settings-backup-schedule.jpg)

Choose the **Frequency** (daily or weekly), the **Day** for weekly backups, the **Time** and **Time zone**, and how many scheduled backups to keep. Older scheduled backups are removed automatically; manual and pre-restore backups aren't.

Every settings change is recorded in the Access log.
