import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@0,400..800;1,400..800&family=JetBrains+Mono:wght@600;700;800&family=Anton&family=Playfair+Display:ital,wght@0,700;0,800;1,700;1,800&family=Caveat:wght@700&display=swap" rel="stylesheet" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  function isHarmless(err) {
                    if (!err) return false;
                    var m = (err.message || String(err || '')).toLowerCase();
                    var n = err.name || '';
                    var s = (err.stack || '').toLowerCase();
                    return n === 'AbortError' ||
                      m.indexOf('abort') !== -1 ||
                      m.indexOf('signal is aborted') !== -1 ||
                      m.indexOf('failed to fetch') !== -1 ||
                      m.indexOf('webchannel') !== -1 ||
                      s.indexOf('webchannel') !== -1;
                  }
                  window.addEventListener('unhandledrejection', function(e) {
                    if (isHarmless(e.reason)) {
                      e.preventDefault();
                      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                  }, true);
                  window.addEventListener('error', function(e) {
                    if (isHarmless(e.error) || isHarmless(e.message)) {
                      e.preventDefault();
                      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                  }, true);
                })();
              `,
            }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
