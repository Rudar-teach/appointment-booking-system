# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability, please report it responsibly rather than opening a public issue.

## Secrets Handling

This repository does NOT contain any API keys, tokens, passwords, or personal information.

- `.env` is gitignored and never committed
- `.env.example` contains placeholder values only
- No real credentials in code

## Before Deploying

1. Copy `.env.example` to `.env`
2. Change `SESSION_SECRET` to a secure random value (32+ characters)
3. Change `DB_PATH` if needed
4. Never commit `.env` or any file containing real credentials
