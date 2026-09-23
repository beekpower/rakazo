# Reusable credentials

Ask a bot to connect an API using a key or password. It calls `request_secret` with a reference name and an HTTPS service origin. The protected card shows that origin before you save. Web, Electron and mobile use the same backend; the value is cleared from the input when submission starts and is omitted from messages, events and model input.

For example, the bot can request:

```json
{
  "label": "API key",
  "purpose": "api_key",
  "credential": {
    "name": "example_api",
    "origin": "https://api.example.test",
    "auth": { "type": "bearer" }
  }
}
```

The value is encrypted in Postgres `bot_secrets` using the deployment's `ENCRYPTION_KEY` (AES-256-GCM with record-bound authentication). Only the run's user can submit a reusable credential. It belongs to that user, space and bot, survives later runs, and is deleted when its owner, space or bot is deleted. Names, destinations and authentication configuration are metadata; `list_secrets` returns those fields without values. No hosted credential service or prebuilt connector is required.

The bot uses `secret_request` to ask the backend to decrypt and inject the credential:

```json
{
  "name": "example_api",
  "url": "https://api.example.test/v1/items",
  "method": "GET"
}
```

Authentication supports Bearer tokens, a named header (`{"type":"header","name":"X-Api-Key"}`), and Basic authentication (`{"type":"basic","username":"api-user"}`). Basic uses the protected value as the password. Requests can send JSON, form-encoded or plain text bodies. The saved origin must match exactly, including port. Redirects and unsafe network destinations are rejected through the shared remote-request policy. Requests follow the existing action approval rules, have a 30-second deadline and a 1 MB response limit, and return at most 20,000 characters of redacted response content without response headers.

Calling `request_secret` again with the same name and configuration returns the saved reference. Add `"replace": true` to show another protected card and replace its value. `forget_secret` with `{"name":"example_api"}` removes the stored value and prevents future use; an already-started request may finish. Remove a credential before changing its origin or authentication configuration. Each user can save up to 100 credentials per bot, with values limited to 16,384 characters.

The model has no tool for reading these values, and the backend removes direct and common encoded echoes from API responses. The approved service still receives the credential: redaction cannot defend against a malicious service deliberately transforming it. Choose a service you trust and use appropriately scoped credentials.

This boundary supports authenticated HTTP requests. Injecting credentials into arbitrary AI-controlled shell commands, files or environment variables would let those commands read them, so those paths are not exposed. APIs needing request signing, OAuth refresh, multiple credentials or custom protocols should use a connector adapter. Existing `request_secret` calls with a `connectionId` retain their one-use connector-code flow.

## Saved website logins

When you want a bot to sign in to a website by itself, ask it to save the login. It calls `request_secret` with `"auth": {"type": "login"}` and the origin of the sign-in page:

```json
{
  "label": "Example sign-in",
  "purpose": "password",
  "credential": {
    "name": "example_login",
    "origin": "https://login.example.test",
    "auth": { "type": "login" }
  }
}
```

The card asks for a username and a password. Both are stored encrypted in the same way as other reusable credentials, and the model sees neither. To sign in, the bot fills fields found with `browser_snapshot`:

```json
{
  "actions": [
    { "kind": "fill_secret", "ref": "e3", "secret": "example_login", "field": "username" },
    { "kind": "fill_secret", "ref": "e4", "secret": "example_login", "field": "password" },
    { "kind": "click", "ref": "e5" }
  ]
}
```

The backend decrypts the value and the page browser types it only if the page is still on the saved origin at that moment, so a login cannot be typed into another site or a page that redirected. Values travel to the computer over stdin, not command-line arguments. Page results are scrubbed of the password, and of the username when it is 6 or more characters (shorter usernames are left alone because redaction replaces every occurrence). A login cannot be used with `secret_request`. Fills need no approval: saving the login is the approval, and it is bound to one site. Use `forget_secret` to remove it.

Two-factor codes, CAPTCHA and passkeys still use `request_takeover`, as does any site where you prefer to sign in yourself.

The value is typed into a real browser on the bot's computer. Anything that can read that browser, including the bot's own shell commands through the page or its debugging port, could read a filled field. Keeping the value out of model input stops accidental disclosure, not a bot that sets out to extract it. Save logins only for accounts you would let the bot use unattended.
