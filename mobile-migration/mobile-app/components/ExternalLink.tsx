import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Platform } from 'react-native';

export function ExternalLink(
  props: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }
) {
  return (
    <Link
      target="_blank"
      {...props}
      // @ts-expect-error: External URLs are not typed.
      href={props.href}
      onPress={(e) => {
        e.preventDefault();
        if (Platform.OS !== 'web') {
          WebBrowser.openBrowserAsync(props.href as string);
        } else {
          window.open(props.href, '_blank', 'noopener,noreferrer');
        }
      }}
    />
  );
}
