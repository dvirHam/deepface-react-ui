import { render, screen } from '@testing-library/react';
import { beforeEach, test, expect, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ results: [], run_count: 0 }),
      })
    )
  );

  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(() =>
        Promise.resolve({
          getTracks: () => [],
        })
      ),
    },
    configurable: true,
  });
});

test('renders app title', () => {
  render(<App />);
  expect(screen.getByText(/^DeepFace$/i)).toBeInTheDocument();
});
