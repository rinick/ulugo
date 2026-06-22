import {useEffect, useRef} from 'react';

const AD_SCRIPT_ID = 'ulugo-google-ad-script';

export function GoogleAd({active}: {active: boolean}) {
  const adRef = useRef<HTMLModElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!active || initializedRef.current) return;

    const adsWindow = window as Window & {adsbygoogle?: unknown[]};
    adsWindow.adsbygoogle = adsWindow.adsbygoogle ?? [];

    if (document.getElementById(AD_SCRIPT_ID) == null) {
      const script = document.createElement('script');
      script.id = AD_SCRIPT_ID;
      script.async = true;
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3283235194066083';
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    const ad = adRef.current;
    if (ad == null) return;

    const initialize = () => {
      if (initializedRef.current || ad.getBoundingClientRect().width <= 0) return;
      initializedRef.current = true;
      adsWindow.adsbygoogle?.push({});
    };
    const observer = new ResizeObserver(initialize);
    observer.observe(ad);
    const frame = window.requestAnimationFrame(initialize);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [active]);

  return (
    <ins
      ref={adRef}
      className="adsbygoogle web-ad"
      data-ad-client="ca-pub-3283235194066083"
      data-ad-slot="9855991090"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
