import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "./lib/trpc";
import App from "./App";
import "./index.css";

// The API sleeps on Render's free tier, so a request that has to wake the
// instance can take ~30s and may bounce off a 502 while the container boots —
// hence the patient retry schedule. Long staleTime + no refetch-on-focus keeps
// navigation between pages instant instead of re-paying that cost per view.
//
// networkMode "always" is the important one. React Query's default trusts
// navigator.onLine and, when that reads false, parks the query in a "paused"
// state that never issues the request and never errors — the page then shows
// loading skeletons forever with nothing to retry and nothing to report.
// navigator.onLine is unreliable (VPNs, captive portals, some corporate
// networks and several browsers report false while the connection is fine),
// and it was doing exactly that here. We would rather attempt the request and
// let a real failure surface as a real error we can show and retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Same reasoning: an admin pressing Save must get either a result or an
      // error, never a button that silently hangs.
      networkMode: "always",
    },
  },
});

// Installed to a home screen the app has no address bar to reload from, so the
// worker is registered after load (never competing with the first paint) and
// serves pages network-first — see public/sw.js.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
);
