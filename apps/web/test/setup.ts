// Adds DOM matchers (toBeDisabled, toHaveAccessibleName…) and unmounts between tests.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
