import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>Portfolio Tracker — Monitor, Analyze &amp; Optimize Your Investments</title>
        <meta name="description" content="Track your stock portfolio, run DCF and Graham valuations, analyze financial statements, and monitor dividends — all in one app." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Portfolio Tracker" />
        <meta property="og:description" content="Track your stock portfolio, run DCF and Graham valuations, analyze financial statements, and monitor dividends." />
        <meta property="og:site_name" content="Portfolio Tracker" />

        {/* Indexing */}
        <meta name="robots" content="index, follow" />
        <meta name="google-site-verification" content="KeR7f3qPReAU2SpQNa_JjjV8JZsXm_5XWDOtbpq7nuU" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
