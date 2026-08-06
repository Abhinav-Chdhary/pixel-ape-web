# Pixel Ape Cloud

Pixel Ape Cloud is the hackathon web application: a browser pixel-art workspace that will let people save, reopen, and share sprite projects.

This repository is deliberately separate from the `pixel-ape` npm/CLI package. It starts with reusable editor UI and pixel-domain logic, while the temporary browser-storage layer will be replaced with an API and PostgreSQL during the Zerops Challenge.

## Run locally

```bash
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5174`.

## Planned deployment architecture

```text
React frontend → Node API → PostgreSQL
```

All three services will be deployed on Zerops. The core hackathon flow is: create a sprite project, save it to the API, reopen it later, and share it with a public link.
