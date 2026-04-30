# Health Tracker

A personal health tracking app built with React + Vite + Tailwind CSS.

## Features

- 📅 **Daily Log** — Food intake with full macro tracking, exercise logging, and weight entry
- 📊 **Weekly Summary** — 7-day calorie bar chart and exercise count
- 📈 **Monthly View** — Calendar heatmap with color-coded days
- 🔴 **Period Tracker** — Cycle phase detection, next period prediction, and history log
- ⚙️ **Editable Targets** — All daily nutrition and exercise targets are fully customisable
- 🏆 **Achievement Badges** — Unlocked when daily targets and exercise are all met
- 💾 **Persistent Storage** — All data saved to `localStorage`; survives page refreshes and browser restarts
- 🍎 **Smart Food Library** — Foods you log are saved with per-gram macros; just type a name next time and weight auto-fills all macros
- 📏 **Flexible Units** — Log food in g, ml, tbsp, cup, oz, and 20+ other units

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node)

### Install & run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Build for production

```bash
npm run build
```

Output goes to the `dist/` folder — drop it on any static host.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Install the Pages plugin:
   ```bash
   npm install --save-dev gh-pages
   ```
3. Add to `package.json` scripts:
   ```json
   "deploy": "gh-pages -d dist"
   ```
4. Build and deploy:
   ```bash
   npm run build && npm run deploy
   ```

## Tech Stack

- [React 18](https://react.dev/)
- [Vite 5](https://vitejs.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [Lucide React](https://lucide.dev/) — icons

## Data & Privacy

All data is stored locally in your browser's `localStorage`. Nothing is sent to any server.
