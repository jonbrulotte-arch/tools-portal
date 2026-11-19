Automated Emails (EDI) sends partners a table of new records (for example ship notices) from our SQL database on a schedule. This guide shows you how to see **what was sent, to whom, and what failed**. Setting up and changing emails is done by the EDI Admin.

## The Emails list

**Automated Emails (EDI) → Emails** lists every automated email.

![The Emails list](images/emails-list.jpg)

| Column | Meaning |
| --- | --- |
| On | The switch shows whether the email is sending automatically. |
| Email | The email's name and its subject. |
| Recipients | Who it goes to (To and CC). |
| Last sent | When it last sent records. |
| Last check | The result of the most recent check: **Sent**, **Nothing new** or **Failed**, with the time. |
| Records sent | How many records this email has sent in total (within the history kept). |

Emails that are on are checked every 15 minutes. Each check sends only records that haven't been emailed before, so a partner never gets the same record twice. If there's nothing new, nothing is sent.

## The email log

**Email log** lists every email that was sent and every failed attempt, newest first.

![The email log](images/log.jpg)

- **Time**: when it ran.
- **Email**: which automated email.
- **How**: *Scheduled* (the 15-minute check), *Manual* (someone clicked Send now) or *Test* (a test sent only to the person testing).
- **Result**: **Sent** or **Failed**.
- **Recipients** and **Records**: who received it and how many records were in it.

Filter by **Email**, **Status** and **How**. **Export CSV** downloads what's shown, for example to answer a partner or for an audit.

## Seeing exactly what was sent

Click any row to open it. A sent email shows the subject, recipients and the **full email as the partner received it**, including the table.

![A sent email opened from the log](images/log-detail.jpg)

A failed entry shows the error instead. A failed send is retried automatically on the next check, so records aren't lost.

## Answering a partner

*"Did you send PO 4500123?"*

1. Open **Email log** and filter **Email** to the right automated email.
2. Open the entries around the date in question and look for the PO in the table.
3. You can tell the partner the time it was sent and the addresses it went to.

If you can't find it, or you see **Failed** entries, tell the EDI Admin, with the email name and the time.
