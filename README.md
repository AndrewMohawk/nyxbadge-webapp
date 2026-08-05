# NYX Badge Webapp

A browser-based controller for compatible 44x11 CH583 LED badges. It uses WebHID to program the badge directly over USB: no native application, account, or server-side badge data is required.

Created by Andrew MacPherson ([AndrewMohawk](https://github.com/AndrewMohawk)).

Live demo: [nyxbadge.andrewmohawk.xyz](https://nyxbadge.andrewmohawk.xyz)

## Features

- Direct USB connection from desktop Chrome or Edge
- Live 44x11 LED preview
- Message, speed, direction, brightness, and blink controls
- Cloudflare Worker deployment with static assets
- All badge communication stays between the browser and USB device

## Run locally

Use Node.js 22.13 or newer:

```sh
npm install
npm run dev
```

Open the local HTTPS/localhost URL in desktop Chrome or Edge, connect a compatible badge, and grant the browser's device permission.

## Build and deploy

```sh
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

The included `wrangler.jsonc` deploys to your Cloudflare `workers.dev` hostname. To use your own hostname, add a Worker Custom Domain to the `routes` array:

```json
"routes": [
  {
    "pattern": "badge.example.com",
    "custom_domain": true
  }
]
```

Change the Worker `name` in `wrangler.jsonc` before deploying if you already use `nyxbadge-webapp`.

## Device compatibility

The controller requests USB HID devices with vendor ID `0x0416` and product ID `0x5020`. Browser support requires WebHID and a secure context; Firefox and Safari do not currently expose WebHID.

## License

MIT
