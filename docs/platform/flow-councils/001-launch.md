---
slug: /flow-councils/launch
description: How to configure and deploy Flow Councils
---

# Launch
You can deploy a Flow Council yourself—no code required—from the [launchpad](https://flowstate.network/flow-councils/launch). Flow Councils are available on Arbitrum One, Base, Celo, and OP Mainnet.

Each Flow Council is configured to distribute a single [Superfluid Super Token](https://docs.superfluid.org/docs/concepts/overview/super-tokens). Flow State natively supports many popular Super Tokens, but also allows deployers to set any [valid Super Token contract address](https://explorer.superfluid.org/arbitrum-one/supertokens) as the distribution currency. Once deployed, this token selection cannot be changed.

[Starting the funding flow is not an admin function](005-grow-the-pie.md) and is done only once recipients are accepted to the Flow Council. It follows that the funding flow rate can also be updated anytime as (hopefully) more funding becomes available or circumstance change.

By default, Flow Councils are open-ended (i.e., there is no "round end date"). It is recommended that operators communicate the expectations the funding amount and duration when a public round is launched.

## Permissions

The deploying address is set as the Flow Council **Super Admin** by default. From the **Permissions** page, a Super Admin can grant any address one or more roles:

- **Super Admin** — full control, including managing other admins and every setting below.
- **Voter Review** — manages Council membership and voter groups.
- **Recipient Review** — reviews applications and manages the recipients in the distribution pool.

Once a voting policy has been set and recipients have been added to the Flow Council, a Super Admin can remove themselves and all other admins to make the configuration immutable. See [Permissions](007-permissions.md) for details.
