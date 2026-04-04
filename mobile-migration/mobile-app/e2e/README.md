# E2E Testing with Maestro

## Setup

1. Install Maestro CLI:
   ```bash
   # macOS / Linux
   curl -Ls "https://get.maestro.mobile.dev" | bash

   # Windows (via WSL)
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. Run the dev server:
   ```bash
   npx expo start --web --port 8081
   ```

3. Run E2E tests:
   ```bash
   maestro test e2e/
   ```

4. Run a single flow:
   ```bash
   maestro test e2e/login-flow.yaml
   ```

## Writing Tests

Maestro flows are YAML files in the `e2e/` directory.
Use `testID` props on React Native components to target elements:

```tsx
<TextInput testID="login-email" />
<Pressable testID="login-button" />
```

## CI Integration

Add to your GitHub Actions workflow:
```yaml
- name: Run E2E tests
  uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app-build.apk
```
