# GhostOps Terminal

Simple setup and run instructions for the local GhostOps Terminal app.

## Prerequisites

- Node.js 18+ (Node 20 LTS recommended)
- npm 9+
- macOS, Linux, or Windows
- Optional (for Ghost CMS control): Ghost CLI (`npm install -g ghost-cli`)

## Install

From the repository root:

```bash
cd ghostops-terminal
npm install
```

## Start The Terminal App

```bash
cd ghostops-terminal
npm start
```

This runs Electron with:

```bash
electron .
```

## Stop / Restart The App

Close the Electron window to stop it, or use your terminal interrupt:

```bash
Ctrl + C
```

Then start it again with:

```bash
npm start
```

## Ghost CMS Commands (Optional)

If you are also running a Ghost blog instance, run these from your Ghost install directory:

```bash
ghost start
ghost stop
ghost restart
ghost status
```

If you added the `ghostops` shell helper, you can run:

```bash
ghostops start
ghostops stop
ghostops restart
ghostops status
```
