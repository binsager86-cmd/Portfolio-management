import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

// Mock dependencies
jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    colors: { textPrimary: "#000", accentPrimary: "#007AFF" },
  }),
}));

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    fonts: { caption: 11, title: 18 },
  }),
}));

import { SectionHeader } from "@/components/ui/SectionHeader";

describe("SectionHeader", () => {
  it("renders title text", () => {
    const { getByText } = render(<SectionHeader title="Portfolio Snapshot" />);
    expect(getByText("Portfolio Snapshot")).toBeTruthy();
  });

  it("renders label variant with uppercase style", () => {
    const { getByText } = render(<SectionHeader title="Holdings" variant="label" />);
    const el = getByText("Holdings");
    const flatStyle = [].concat(...(el.props.style || []));
    expect(flatStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ textTransform: "uppercase" }),
      ]),
    );
  });

  it("renders right element when provided", () => {
    const { getByText } = render(
      <SectionHeader title="Test" right={<Text>Extra</Text>} />,
    );
    expect(getByText("Extra")).toBeTruthy();
  });

  it("renders without crashing with icon", () => {
    const { getByText } = render(<SectionHeader title="With Icon" icon="pie-chart" />);
    expect(getByText("With Icon")).toBeTruthy();
  });
});
