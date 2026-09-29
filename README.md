# Nexus API

Free REST API collection. No login, no API key, no database.

## Deploy
1. Push this folder to GitHub.
2. Vercel -> Add New Project -> import the repo -> Deploy. (No settings needed.)

## Files
- `api/index.js`  - every API lives here
- `public/index.html` - docs page (auto-lists all endpoints)
- `vercel.json`, `package.json`

## New API add karanna
Open `api/index.js` and copy any `add(...)` block:

```js
add('hello', 'Fun', 'Say hello', { name: 'Lucifer' }, (q) => ({ message: 'Hello ' + q.name }));
```
It appears at `/api/hello` and on the docs page automatically.
