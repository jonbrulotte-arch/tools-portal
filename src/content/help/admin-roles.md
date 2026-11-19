For admins with the **Manage roles & permissions** permission. A **role** is a named bundle of access, for example *EDI Admin* or *Customer Service*. Each user has exactly one role.

![Roles & Permissions](images/roles.jpg)

## What a role grants

Edit a role (pencil) to choose what its members can administer and which tools they can open.

![Editing a role](images/role-editor.jpg)

- **Admin permissions**:
  - **Manage users**, **Manage roles & permissions**, **Manage tools**, **View access log**, **Backup & restore** and **Platform settings**.
  - Each one shows the matching item under *Admin* in the sidebar.
- **Tool access**: the tools members can open. Only tools that are enabled appear to users.
- **Tool permissions**: extra rights inside a tool:
  - **\<Tool\>: manage tool settings**: the tool's Settings, and for Automated Emails, creating and editing emails. This is what makes someone an *EDI Admin* or a *Shipping settings* manager.
  - **Shopify: view all discounts**: see everyone's discounts, not only your own.
- **Super Admin** always has full access to everything, and can't be edited or deleted.

Users can also get **extra tool access** individually (Admin → Users), on top of their role.

## Suggested roles

| Role | Tools | Permissions |
| --- | --- | --- |
| EDI Admin | Automated Emails (EDI) | Automated Emails (EDI): manage tool settings |
| EDI Viewer | Automated Emails (EDI) | none |
| Customer Service | Shopify Discount Code Generator | none |
| Logistics | Shipping Rates Generator | Shipping Rates Generator: manage tool settings |

## Help & Docs follows roles

Help & Docs shows each person only the guides for what their role allows. For example, the EDI Admin SOP appears only for people with *Automated Emails (EDI): manage tool settings*, and the admin guides only for people with the matching admin permission.

## Deleting a role

Move its members to another role first: a role with members can't be deleted. System roles (Super Admin) can't be deleted.
