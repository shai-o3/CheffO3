import { useEffect, useRef, useState } from 'react';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    const s = existing || Object.assign(document.createElement('script'), { src: GSI_SRC, async: true });
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Google script failed')));
    if (!existing) document.head.appendChild(s);
  });
}

/** Google Identity Services button. Calls onCredential(idToken) after the user picks an account. */
export default function GoogleButton({ clientId, onCredential, text = 'continue_with' }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  cb.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => cb.current(credential) });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline', size: 'large', text, shape: 'pill', locale: 'he',
        width: Math.min(320, ref.current.offsetWidth || 320),
      });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (failed) return <div className="alert alert-error">לא ניתן לטעון את הכניסה עם Google כרגע</div>;
  return <div ref={ref} className="google-btn" />;
}
