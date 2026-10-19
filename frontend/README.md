# Y frontend

Next.js 16.4.2 (App Router, TypeScript strict), React 19.3.0, on Node.js 24. The backend API is in `../backend`.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000 (needs the backend on NEXT_PUBLIC_API_URL, default http://localhost:8080)
npm run build && npm start
npm run lint           # ESLint (flat config, eslint-config-next core-web-vitals + TypeScript)
npm run typecheck      # tsc --noEmit, strict
npm test               # Vitest and Testing Library (jsdom)
npm run format:check   # Prettier (npm run format to write)
npm run tokens         # regenerate styles/tokens.css from styles/tokens.json
npm run tokens:check   # fails when tokens.css is out of date
```

## Layout

- `app/`: routes (App Router), root layout, error and not-found pages.
- `components/`: UI components and their CSS Modules.
- `lib/`: client for the backend API.
- `styles/`: design tokens (`tokens.json` is the copy of the Claude Design "Y" design system; `tokens.css` is generated).

Configuration: copy `.env.example` to `.env.local` to change `NEXT_PUBLIC_API_URL`.
