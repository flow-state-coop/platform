---
slug: /flow-qf
description: Flow QF (aka Streaming Quadratic Funding), continuous quadratic funding for public goods.
sidebar_position: 3
---

# Flow QF

:::tip[Want to run a round?]
We've designed and run Flow QF rounds, and we're happy to set one up for your ecosystem or community. [Get in touch on Telegram](https://t.me/+U6ZFRmOnFWo1ZGUx) if you want to run a round.
:::

Flow QF (aka Streaming Quadratic Funding, or SQF) is a novel implementation of [quadratic funding (QF)](https://www.wtfisqf.com/?grant=&grant=&grant=&grant=&match=1000), the public goods funding mechanism [introduced by Vitalik Buterin, Zoe Hitzig, & Glen Weyl](https://arxiv.org/pdf/1809.06421) and popularized in web3 by [Gitcoin](https://www.gitcoin.co/).

Flow QF is QF with a streaming architecture. Donations are structured as open-ended money flows rather than one-off transfers. A quadratic matching formula continuously allocates pool funds based on these streamed “votes.”

People sometimes describe quadratic funding (and [quadratic voting](https://www.radicalxchange.org/wiki/quadratic-voting/)) as high-bandwidth democracy. In QF/QV, participants express not just the direction of their preferences but also the degree of these preferences. These additional bits of information help improve the collective decision-making process by optimizing how voices are heard.

Flow QF extends this informational advantage by embracing the dimension of time. Participants can change their donation streams with new information or preferences anytime. These changes will immediately (and gas-efficiently) update the corresponding quadratic matching streams going forward. Put another way, Flow QF’s democratic outputs adjust to changes in preferences in real time.

## Why streaming?

Flow QF isn’t just a *faster* QF.

By eliminating time discontinuities of the periodic round, Flow QF becomes a different QF—creating new dynamics for grantees, donors, and outcomes while maintaining QF’s core democratic principles and effectiveness.

Flow QF rounds can be open-ended or longer than practical for periodic rounds (with traditional QF, the matching pool is distributed only after the round ends). This shift can relieve structural pressure to consolidate grantee discovery and donor/voter participation.

Flow QF grantees don’t need to compete for donor mindshare during constrained voting periods the same way and can stay focused on their core missions. Donation widgets in dapps, websites, code repos, and on social could become the primary and decentralized method to discover worthy grants.

The periodic round structure also asks a lot of donors/voters. It’s difficult to make informed decisions across numerous and broad rounds. With Flow QF, there’s an opportunity for higher signal and sustained donor-grantee relationships that evolve naturally on the donor’s timeline.

Flow QF’s continuous model can also provide more funding predictability for grantees. Funds streamed through a Flow QF pool immediately hit the grantee’s account with incremental shifts in receipts.

This velocity means amplified impact and efficiency with limited capital from funders. Take the [Geo Web](https://geoweb.network) protocol (where [Flow QF was invented](https://geoweb.land/governance)) for example. It generates ETH streams from its [PCO land market](https://docs.geoweb.network/concepts/partial-common-ownership/). Before Flow QF, these funds would idly accumulate in the treasury until being periodically dispersed. Now, the Geo Web’s ETH can immediately help grow the network (i.e., grow the ETH revenue the land market generates) and drive a public goods flywheel. This is how scrappy public goods can outcompete lavishly-funded behemoths.
