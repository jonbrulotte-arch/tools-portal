This SOP is for **EDI Admins**: the people who set up Automated Emails (EDI), build the emails partners receive, and keep them running. If you only need to check what was sent, read *Automated Emails (EDI): reading the email log* instead.

## 1. Purpose and responsibilities

Automated Emails sends partners (retailers, 3PLs, buyers) a table of **new records** from our SQL database, such as ship notices or invoice confirmations, on a schedule. Each record is emailed **once**: the tool remembers what it has sent and skips it next time.

As EDI Admin you are responsible for:

- the module's connections: the Microsoft Graph sender and the SQL Server login (Settings tab);
- creating, testing, changing and retiring automated emails;
- checking the email log every working day and fixing failures;
- telling partners and Customer Service before an email changes or stops.

![The Emails tab, showing one email that is on and one that is off](images/emails-list.jpg)

## 2. Access and permissions

| What you can do | Who |
| --- | --- |
| See the Emails list and the Email log | Anyone whose role includes the **Automated Emails (EDI)** tool |
| Create, edit, send, turn on/off, delete emails; change Settings | Roles with the tool **and** its **Manage tool settings** permission (the *EDI Admin* role), and Super Admins |

Access is granted by a platform admin in **Admin → Roles**. If you can see the Emails list but not the **New automated email** button or the **Settings** tab, ask an admin to add the *Manage tool settings* permission for Automated Emails (EDI) to your role.

> Note: Every change you make (create, edit, turn on/off, delete, forget sent records, settings) and every send or failure is written to the platform's Access Log under `auto_email.*`.

## 3. One-time setup (Settings tab)

Do this once, before the first email. Open **Automated Emails (EDI) → Settings**.

### Microsoft Graph (the sender)

Emails are sent through Microsoft 365 by an Entra ID **app registration**. IT creates it once:

1. In the Entra admin center, register an app (for example *Tools Portal EDI mail*).
2. Under **API permissions**, add Microsoft Graph → **Application permissions → `Mail.Send`**, then click **Grant admin consent**.
3. Create a **client secret** and copy its *value* (it's shown only once).
4. Decide which mailbox the emails come from, for example a shared mailbox `edi@yourcompany.com`. IT can limit the app to that mailbox with an Exchange application access policy.

Then fill in the card and click **Save & send a test to *you***. You should receive a test email within a minute.

![Microsoft Graph settings: the IDs and secret are hidden once saved](images/settings-graph.jpg)

- **Tenant ID, Client ID and Client secret** are encrypted when saved and never shown again. The box shows only the last 4 characters so you can tell which one is stored. Leave a box blank to keep what's saved; type a new value to replace it.
- **Send from** must be a licensed or shared mailbox the app may send as.
- **Sender name** is the display name partners see (optional).

### SQL Server (where the records come from)

![SQL Server settings, signed in with a Windows (domain) account](images/settings-sql.jpg)

1. **Server**: the host name or IP of the SQL Server, for example `sql01.yourcompany.local` or `10.0.10.20`. For a **named instance** type `host\INSTANCE` (for example `sql01\EDI`); the port is then looked up automatically.
2. **Port**: SQL Server's default is **1433**. Don't use 3389: that's Remote Desktop, and the connection will time out (the form warns you).
3. **Database**: the database name, for example `EDI`.
4. **Sign in with**:
   - **SQL Server login**: a login created in SQL Server itself (*Security → Logins*, "SQL Server authentication").
   - **Windows (domain) account**: an Active Directory account. Fill in **Domain** (for example `STEELMANJS`) and the account name without the domain, or type `DOMAIN\account` in the account box.
5. **Account / password**: encrypted and hidden like the Graph secret.
6. **Encrypt the connection**: leave on. Turn on **Trust the server's certificate** if the server uses its own self-signed certificate (most internal servers do).
7. Click **Save & test connection**. A green message means the tool connected and ran a test query.

> Warning: Use a **dedicated, read-only** account for this tool, not a person's own login. Ask the DBA for a login with only `db_datareader` on the EDI database. The tool also refuses any query that isn't a single `SELECT`, but the read-only login is the real safety net.

![Port 3389 is Remote Desktop: the form warns before you save](images/port-warning.jpg)

### Schedule & limits

![Schedule and limits](images/settings-schedule.jpg)

| Setting | Default | What it does |
| --- | --- | --- |
| Send automatically | On | The master switch. Turn it **off** to pause every automated email at once (for example during a database migration). Manual sends still work. |
| Check every | 15 minutes | How often emails that are on are checked (5, 15, 30 or 60 minutes). |
| Most records in one email | 500 | If more new records than this are found, the rest go in the next run. |
| Date format | MM/DD/YYYY | Used for the date added to subjects and for date columns in the table. |
| Time zone for the send date | Pacific | Which day "today" is for the subject date. |
| Remember sent records (days) | 120 | How long the tool remembers what it sent. **Must be longer than any query's look-back**, or old rows could be emailed again. |
| Keep the email log (days) | 180 | How long log entries (including the email body) are kept. |

## 4. Creating an automated email

Click **New automated email** on the Emails tab. The editor has six numbered sections. Give the email a clear **Name** first, such as *Home Depot ship notices*: it's what everyone sees in the list and the log.

![The top of the editor: name, contacts and subject](images/editor-contacts-subject.jpg)

### 1 · Contacts

- **To**: the partner's addresses, separated by commas or new lines. At least one is required before the email can be turned on.
- **CC**: usually our own team (for example Customer Service) so we have a copy.

### 2 · Subject

Type the subject. Leave **Add the send date** on so each email is unique in the partner's inbox, for example *JS Products ship notice - 11/19/2026*.

### 3 · Intro text

The greeting shown above the table. A blank line starts a new paragraph.

![Intro text](images/editor-intro.jpg)

### 4 · Data table (SQL query)

This is the heart of the email: the query decides **which records** go out and **which columns** the partner sees.

![The SQL query, the Test query result and the key columns](images/editor-sql.jpg)

Rules for the query:

- **One read-only statement**: a `SELECT`, or `WITH … SELECT`. Anything that writes or runs code (`INSERT`, `UPDATE`, `DELETE`, `EXEC`, `SELECT … INTO`, `DECLARE`, `SET`, `USE`, `WAITFOR` and similar) is refused.
- **Look back about 2 weeks**, not "since the last run". The tool removes what it already sent, so a 2-week window safely catches late or corrected records. The window must be shorter than *Remember sent records* (120 days by default).
- **Name the columns the way the partner should see them** with `AS`. Column names become the table headings.
- If a column name is a SQL keyword or has spaces, put it in **brackets**: `[PO Number]`, `[Set]`, `[Date]`.
- A query may run for up to **60 seconds** and return up to **20,000 rows**. More than that fails, so narrow the date range or filters.
- Sort the rows the way the partner reads them (`ORDER BY`).

Example, ship notices for one partner over the last 14 days:

```sql
SELECT s.PoNumber AS [PO Number], s.LineNo AS Line, s.PartNumber AS [Part Number],
       s.QtyShipped AS Qty, s.ShipDate AS [Ship Date], s.Carrier, s.TrackingNumber AS Tracking
FROM dbo.Shipments s
WHERE s.Partner = 'HOMEDEPOT'
  AND s.ShipDate >= DATEADD(day, -14, CAST(GETDATE() AS date))
ORDER BY s.ShipDate, s.PoNumber, s.LineNo
```

Click **Test query**. It runs the query and shows how many rows came back, how many are **new** and how many were **already sent**, plus the first rows and each column's type.

#### Key columns

Tick the column(s) that **identify one record**. A record is emailed once per key value.

| Email | Good key | Why |
| --- | --- | --- |
| Ship notices by line | PO Number + Line | One row per PO line |
| Invoices | Invoice | One row per invoice |
| Shipments by carton | Tracking | One row per package |

> Tip: Choose the key carefully. If the key is too broad (for example only *PO Number* when there are several lines), later lines of the same PO are **never sent**. If it's too narrow (for example including *Qty*), a corrected quantity is sent again as a new record. Later changes to a row that was already sent are **not** re-sent.

### 5 · Closing text

The sign-off shown below the table, for example *Thank you, JS Products EDI team*.

### 6 · Preview

Click **Preview email** to see exactly what the partner will receive with the current new records, or with sample rows if nothing is new.

![Preview of the email](images/editor-preview.jpg)

## 5. Test, then turn on

Follow these steps in order for every new or changed email:

1. **Test query**: check the row count and that the key columns are ticked.
2. **Preview email**: check the subject, wording, columns and dates.
3. **Save & send test to me**: a copy goes to *your* address only, with `[TEST]` in the subject. Tests never mark records as sent.
4. Check the test email in Outlook (layout, columns, dates).
5. Turn the email **On** (the switch next to the name, or on the Emails list) and click **Save**.

![The buttons at the bottom of the editor](images/editor-buttons.jpg)

> Warning: **The first run after turning an email on sends every row the query returns** (up to *Most records in one email*), because nothing has been sent yet. With a 2-week look-back that can be two weeks of records. If the partner has already received those by other means, agree with them first, or temporarily narrow the query's look-back for the first run.

## 6. What happens every 15 minutes

For each email that is **on**, one at a time:

1. The query runs against SQL Server.
2. Rows whose key was already sent are removed. Duplicate keys within one run are sent once.
3. If nothing is new, nothing is sent and **Last check** is updated. Nothing is written to the log.
4. If there are new rows, one email with up to *Most records in one email* rows is sent through Microsoft Graph. Any extra rows go in the next run.
5. The keys are recorded as sent **only after Microsoft accepts the email**. If the send fails, the same rows are tried again in the next run, so nothing is lost.

A failed run is logged with the error, and the email shows **Failed** in the *Last check* column until the next successful run.

**Send now** (the paper-plane icon on the Emails list) runs one email immediately, exactly like a scheduled run: to the real recipients, recording what it sends.

## 7. Daily checks

Every working morning:

1. Open **Automated Emails (EDI) → Emails**. Every email that should be on is **On**, and *Last check* is recent (within the check interval).
2. Look for a red **Failed** badge in *Last check*. Open the **Email log**, filter *Status → Failed*, read the error and fix it (see section 9).
3. Confirm that automatic sending isn't paused: the top of the Emails tab says *checked every 15 minutes*, not *Automatic sending is paused*.
4. If a partner says they didn't receive something, filter the log by that email, open the entries around the date in question and look for the PO or invoice in the table that was sent. The entry shows who it went to and when.

![The email log](images/log.jpg)

## 8. Changing or retiring an email

| Task | How | Notes |
| --- | --- | --- |
| Edit wording, recipients or columns | Click the email (or the pencil), change it, **Save** | What was already sent is kept, so only new records go out under the new layout. Send yourself a test after any change. |
| Change the key columns | Edit and Save | Records already sent under the old key may be sent again. Usually follow with *Forget sent records* only if you *want* a resend. |
| Pause one email | Turn its switch **Off** | Nothing is lost: when you turn it back on, everything new in the look-back window is sent. |
| Pause all emails | Settings → turn **Send automatically** off | Remember to turn it back on. |
| Copy an email for another partner | **Duplicate** (copy icon) | The copy starts **off**, with no sent history. Change the name, recipients and query, test, then turn it on. |
| Resend everything | Open the email → **Forget sent records** | The next run sends every row the query returns again. Use it only when a partner asks for a full resend or after fixing a wrong key. Tell the partner first. |
| Retire an email | Turn it off; **Delete** it once nobody needs it | Deleting removes its sent-record history. Its log entries are kept. |

## 9. The email log and troubleshooting

The **Email log** lists every send and failure: time, email, how it ran (*Scheduled*, *Manual* or *Test*), result, recipients and record count. Filter by **Email**, **Status** and **How**, and use **Export CSV** for a partner or an audit. Click a row to see the full email that was sent, or the error.

![A failed run: the error is shown instead of the email](images/log-failed.jpg)

| Error (in the log or test) | Likely cause | Fix |
| --- | --- | --- |
| *Failed to connect to …:3389 in 15000ms* | Wrong port: 3389 is Remote Desktop | Set the port to **1433** (or the instance's port). |
| *Failed to connect … in 15000ms* (port 1433) | Firewall, wrong server name or SQL Server not listening on TCP | Ask IT to allow the portal server (10.0.10.106) to reach the SQL Server on 1433, and to enable TCP/IP in SQL Server Configuration Manager. For a named instance, use `host\INSTANCE` and make sure the SQL Browser service (UDP 1434) is reachable. |
| *getaddrinfo ENOTFOUND* | The server name doesn't resolve from the portal server | Use the full name (`sql01.domain.local`) or the IP address. |
| *Login failed for user 'name'* | Wrong password, or the login type doesn't match | A SQL Server login needs **Sign in with → SQL Server login**. An Active Directory account needs **Windows (domain) account** plus the domain. Check that the server allows "SQL Server and Windows Authentication mode" for SQL logins. |
| *Login failed for user 'DOMAIN\account'* | The Windows account has no login on SQL Server, or is locked or expired | The DBA adds it: `CREATE LOGIN [DOMAIN\account] FROM WINDOWS`, then a database user with `db_datareader`. Check the account isn't locked in Active Directory. NTLM must be allowed. |
| *Cannot open database "X"* | Wrong database name, or the login has no user in it | Fix the name, or ask the DBA to add the login to that database. |
| *Invalid column name* / *Invalid object name* | The query refers to something that doesn't exist (or changed) | Fix the query and click **Test query**. Use brackets for names with spaces or keywords. |
| *Only read-only queries are allowed: "SET" isn't permitted here* (or *Only one statement is allowed*) | The query contains a word like `INSERT`, `SET`, `DECLARE`, `INTO`, or a `;` | Rewrite it as one `SELECT` without a trailing `;`. Put column names that are keywords in brackets, e.g. `[Set]`. |
| *Key column "X" isn't in the query's results* | A key column was renamed or removed from the query | Edit the email, run **Test query**, tick the key columns again and save. |
| *The query returned more than 20,000 rows* | Look-back too long or a filter is missing | Narrow the date range (about 2 weeks) or filter by partner. |
| *Timeout: Request failed to complete in 60000ms* | The query is too slow | Add a date filter on an indexed column, or ask the DBA for an index or a view. |
| *Microsoft Graph … (401 / invalid_client)* | Wrong tenant ID, client ID or client secret, or the secret expired | Create a new client secret in Entra and save it in Settings. Note the expiry date. |
| *Microsoft Graph … (403 / ErrorAccessDenied)* | `Mail.Send` isn't admin consented, or the app isn't allowed to send as that mailbox | Ask IT to grant admin consent and check the application access policy. Include the **request ID** from the error when you contact IT or Microsoft. |
| *Microsoft Graph … (404 / ErrorInvalidUser)* | The *Send from* mailbox doesn't exist or isn't licensed | Fix the address, or use a shared mailbox. |
| *This email has no 'To' recipients* | The To box is empty | Add the partner's address. |
| Nothing is sent, no error | No new records, the email is off, or **Send automatically** is off | Check the switch, Settings, and **Test query** (it shows how many rows are *new*). |
| Partner received the same record twice | The key columns are too narrow, or *Forget sent records* was used, or *Remember sent records* is shorter than the look-back | Fix the key or the retention setting. |

> Tip: After fixing a problem you don't have to wait 15 minutes: click **Send now** on the Emails list. Records from the failed run are still pending and go out then.

## 10. Security

- The Graph tenant ID, client ID, client secret and the SQL account and password are **encrypted** in the database and **never sent back to the browser**. You only see the last 4 characters as a reminder.
- The SQL account should be read-only, and the tool also refuses anything but a single `SELECT`.
- Each email body sent is kept in the log for the retention period (180 days by default), visible to everyone with access to the tool. Don't include columns partners or colleagues shouldn't see.
- Every change and every send is in **Admin → Access log**: filter on actions starting `auto_email.` (for example `auto_email.updated`, `auto_email.sent`, `auto_email.failed`, `auto_email.sent_history_reset`, `auto_email.settings_updated`).

## 11. Quick-reference checklist

New automated email:

- [ ] Name says partner + document (for example *Lowe's invoice confirmations*)
- [ ] To = the partner; CC = our team
- [ ] Query is a single `SELECT`, looks back about 2 weeks, columns named for the partner
- [ ] **Test query** works; key columns identify one record
- [ ] **Preview** looks right
- [ ] **Save & send test to me** received and checked
- [ ] Partner told about the first email (it includes the whole look-back window)
- [ ] Turned **On** and saved
- [ ] Next morning: the log shows it **Sent**

Every day:

- [ ] No **Failed** badges on the Emails list
- [ ] **Send automatically** is on
- [ ] Failures fixed and resent with **Send now**
