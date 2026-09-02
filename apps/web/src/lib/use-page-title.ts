'use client';

import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Call Center CRM` : 'Call Center CRM';
  }, [title]);
}
