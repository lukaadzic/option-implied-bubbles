# Security

This is a static dashboard over public, read-only research data. It has no
backend, no accounts, no user input that reaches a server, and stores nothing
about visitors. The realistic security surface is small.

## What is worth reporting

- A way to make the dashboard execute untrusted content, for example through a
  crafted data file or URL parameter.
- A dependency advisory that actually affects the shipped bundle rather than
  the build tooling.
- Anything that exposes the blob store's write token. It should never appear in
  client code, in the repository, or in a build artefact. If you find it in any
  of those places, that is a real issue.

## What is not

- The blob URLs themselves. They are public by design; the data is published
  research output.
- The absence of authentication. There is nothing to authenticate.

## How to report

Use GitHub's [private vulnerability reporting](https://github.com/lukaadzic/financial-bubble-detection-dashboard/security/advisories/new)
rather than opening a public issue. Include what you did and what happened. A
proof of concept is welcome but not required.

Expect an acknowledgement within a week. This is a research project maintained
alongside other work, so please do not expect a same-day turnaround.
