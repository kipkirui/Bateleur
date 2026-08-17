# Security Policy

Bateleur is a local-first mail client. It stores mailbox passwords in the OS
keychain and mail in a local SQLite cache. Treat credential and mail-handling
bugs as security issues.

## Supported versions

This project is pre-1.0. Report issues against the default branch.

## What to report

Please report privately if the issue could let someone:

- Read or exfiltrate mailbox passwords or API keys
- Access another person’s mail cache
- Bypass TLS / certificate checks without an explicit user action
- Execute script from a message body (XSS in the reader)
- Send mail without the confirm step
- Proxy mail or model calls to an unexpected host

Do **not** open a public GitHub issue for those.

## How to report

Contact the maintainer on X: [@twkip](https://x.com/twkip).

Include:

- A short description of the impact
- Steps to reproduce, or a patch
- Affected OS (Windows, macOS, Linux)
- App version or git commit, if you know it

Please give a reasonable window to fix before public disclosure.

## What we will not do

Bateleur does not upload your inbox to a cloud API to render it. Staff (when it
ships) is bring-your-own-key: mail body is sent only to the provider you chose,
and only when a capability is on. There is no official inference proxy.

## Non-security bugs

Ordinary bugs and product gaps belong in GitHub issues. See [`STATUS.md`](./STATUS.md)
for what is already known to be unfinished.
