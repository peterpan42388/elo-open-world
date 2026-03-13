# GitHub Auth Manual Checklist

## What Codex Could Complete

- Application-side GitHub OAuth routes
- Redirect URL generation
- GitHub link / unlink flow in the UI
- Server-side callback handler

## What Still Requires Manual GitHub Console Work

The following steps must be completed manually in GitHub because current repository token scopes do not provide reliable administrative access to create or edit GitHub Apps / OAuth Apps through automation.

## Required Manual Steps

### 1. Confirm Which GitHub Auth Product You Are Using

Use one of the following:

- GitHub OAuth App
- GitHub App with user authorization flow

The current application code expects:

- `Client ID`
- `Client Secret`
- browser redirect callback support

### 2. Set Callback URL

Set the callback URL exactly to:

`https://world.metavie.co/auth/github/callback`

### 3. Confirm Homepage URL

Recommended homepage:

`https://world.metavie.co`

### 4. Confirm OAuth Scopes

Current app flow expects:

- `read:user`
- `user:email`

### 5. Confirm Server Environment

Make sure server env has:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `PUBLIC_BASE_URL=https://world.metavie.co`

### 6. Run Manual Verification

After saving GitHub settings:

1. Open `https://world.metavie.co/#join`
2. Click `Continue with GitHub`
3. Complete authorization
4. Confirm redirect returns to `world.metavie.co`
5. Confirm the account appears in `Settings`

## What Codex Cannot Reliably Do Right Now

- Create a new GitHub OAuth App from GitHub account settings
- Create a new GitHub App from the GitHub web console
- Change callback URL in GitHub account settings
- Approve organization-level GitHub App installation dialogs

These actions require GitHub web-console permissions and user interaction outside the repository token scope currently available.
