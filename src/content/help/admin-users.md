For admins with the **Manage users** permission. **Admin → Users** is where people get into the portal, and where their access is changed or removed.

![Users](images/users.jpg)

## Inviting someone

1. Click **Invite User**.
2. Enter their **Full name** and work **Email address**, and choose a **Role**. The role decides their tools and admin areas.
3. Optionally tick **Extra tool access**: tools for this person only, on top of their role.
4. Click **Invite**. They receive an email with a link to set their password, valid for 72 hours by default.

![Invite user](images/invite.jpg)

> Note: If the platform's email (Microsoft Graph) isn't set up, a banner says so and you get an **invite link to share yourself** instead. Set up email under **Admin → Settings → Email (Microsoft Graph)**.

## Statuses

| Status | Meaning |
| --- | --- |
| Invited | Hasn't set a password yet. **Resend invite** (envelope icon) sends a new link. |
| Active | Can sign in. |
| Locked | Too many wrong passwords. It unlocks by itself after the lockout time, or click **Unlock account**. |
| Disabled | Can't sign in. Their history is kept. |

## Everyday actions

The icons at the end of each row:

- **Edit user & tool access** (pencil): name, role and extra tool access. Changes apply on the person's next page load; they don't need to sign out.
- **Send password reset email** (key): they get a reset link. You never see or set their password.
- **Disable user** / **Re-enable user**: use **Disable** when someone leaves. It's immediate and reversible.
- **Delete user** (bin): permanent. Their history stays in the access log. Prefer **Disable** unless the account was created by mistake.

You can't disable, delete or change the role of your own account. Only a Super Admin can manage Super Admin accounts, and the last active Super Admin can't be removed.

## Offboarding checklist

- [ ] **Disable** the user on their last day
- [ ] If they managed a tool (EDI Admin, Shipping settings), make sure someone else has that role
- [ ] Rotate any shared credential they knew (for example a tool's API secret)
