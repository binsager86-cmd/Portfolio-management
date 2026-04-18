import { render } from "@testing-library/react-native";
import React from "react";

// Mock theme store
jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    colors: {
      textMuted: "#999",
      accentPrimary: "#007AFF",
    },
  }),
}));

import { LastUpdated } from "@/components/ui/LastUpdated";

describe("LastUpdated", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renders nothing when no timestamp", () => {
    const { toJSON } = render(<LastUpdated />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when timestamp is 0", () => {
    const { toJSON } = render(<LastUpdated timestamp={0} />);
    expect(toJSON()).toBeNull();
  });

  it("shows 'just now' for recent timestamp", () => {
    const { getByText } = render(<LastUpdated timestamp={Date.now() - 3000} />);
    expect(getByText(/just now/)).toBeTruthy();
  });

  it("shows seconds for <60s", () => {
    const { getByText } = render(<LastUpdated timestamp={Date.now() - 30_000} />);
    expect(getByText(/30s ago/)).toBeTruthy();
  });

  it("shows minutes for <60m", () => {
    const { getByText } = render(<LastUpdated timestamp={Date.now() - 300_000} />);
    expect(getByText(/5m ago/)).toBeTruthy();
  });

  it("shows hours for >=60m", () => {
    const { getByText } = render(<LastUpdated timestamp={Date.now() - 7_200_000} />);
    expect(getByText(/2h ago/)).toBeTruthy();
  });

  it("uses custom label", () => {
    const { getByText } = render(<LastUpdated timestamp={Date.now()} label="Refreshed" />);
    expect(getByText(/Refreshed/)).toBeTruthy();
  });
});
