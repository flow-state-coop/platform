import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta
          name="description"
          content="A streaming funding platform & digital cooperative for funding, sustaining, & rewarding impact work. Streaming quadratic funding, streaming quadratic voting, council voting, & more."
        />
        <meta property="og:url" content="https://flowstate.network" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Flow State - Making Impact Common" />
        <meta
          property="og:description"
          content="A streaming funding platform & digital cooperative for funding, sustaining, & rewarding impact work. Streaming quadratic funding, streaming quadratic voting, council voting, & more."
        />
        <meta
          property="og:image"
          content="https://opengraph.b-cdn.net/production/images/46f99288-6ea8-4768-af0c-4b716bc1bf02.png?token=_GzabZBVzFhqh2_MDikORxOyaHHx9NygbVgatN7KFHY&height=630&width=1200&expires=33264419569"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="flowstate.network" />
        <meta property="twitter:url" content="https://flowstate.network" />
        <meta
          name="twitter:title"
          content="Flow State - Making Impact Common"
        />
        <meta
          name="twitter:description"
          content="A streaming funding platform & digital cooperative for funding, sustaining, & rewarding impact work. Streaming quadratic funding, streaming quadratic voting, council voting, & more."
        />
        <meta
          name="twitter:image"
          content="https://opengraph.b-cdn.net/production/images/46f99288-6ea8-4768-af0c-4b716bc1bf02.png?token=_GzabZBVzFhqh2_MDikORxOyaHHx9NygbVgatN7KFHY&height=630&width=1200&expires=33264419569"
        />

        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" />
        <link
          rel="shortcut icon"
          href="/android-chrome-192x192.png"
          sizes="192x192"
        />
        <link
          rel="shortcut icon"
          href="/android-chrome-512x512.png"
          sizes="512x512"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
