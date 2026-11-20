/** Where apps send telemetry. Override with VITE_INGEST_URL when the ingestion service has its own domain. */
export const INGEST_URL = (import.meta.env.VITE_INGEST_URL as string | undefined) ?? `${window.location.origin}/ingest/v1`;

export function nodeSnippet(environment: string) {
  return `// npm install @shieldops/node
import express from 'express';
import { ShieldOps } from '@shieldops/node';

const shieldops = ShieldOps.init({
  key: process.env.SHIELDOPS_KEY,
  endpoint: '${INGEST_URL}',
  environment: '${environment}',
  release: process.env.APP_VERSION,
});

const app = express();
app.use(shieldops.requestHandler()); // response times and request context

// ...your routes...

app.use(shieldops.errorHandler()); // after all routes: captures errors

// Security events, e.g. in your login route:
shieldops.security.loginFailed({ account: email, ip: req.ip });
shieldops.security.loginSucceeded({ userId: user.id, ip: req.ip });`;
}

export function browserSnippet(environment: string) {
  return `// npm install @shieldops/browser
import { ShieldOps } from '@shieldops/browser';

ShieldOps.init({
  key: import.meta.env.VITE_SHIELDOPS_KEY, // a browser key (so_pub_…)
  endpoint: '${INGEST_URL}',
  environment: '${environment}',
  release: import.meta.env.VITE_APP_VERSION,
});`;
}

export const envVarSnippet = (secret: string, kind: 'server' | 'browser') => (kind === 'browser' ? `VITE_SHIELDOPS_KEY=${secret}` : `SHIELDOPS_KEY=${secret}`);

/** The server agent: one static binary, outbound HTTPS only, no open ports, no remote commands. */
export function agentInstallSnippet(secret: string) {
  return `curl -fsSL ${INGEST_URL.replace(/\/v1$/, '')}/agent/install.sh | sudo SHIELDOPS_AGENT_TOKEN=${secret} sh`;
}

export function agentDockerSnippet(secret: string) {
  return `docker run -d --name shieldops-agent --restart unless-stopped \\
  --pid host --network host \\
  -v /:/host:ro -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -e SHIELDOPS_AGENT_TOKEN=${secret} \\
  -e SHIELDOPS_ENDPOINT=${INGEST_URL} \\
  ghcr.io/shieldops/agent:1`;
}

export function reactNativeSnippet(environment: string) {
  return `// npx expo install @shieldops/react-native
import * as Application from 'expo-application';
import { ShieldOps } from '@shieldops/react-native';

ShieldOps.init({
  key: process.env.EXPO_PUBLIC_SHIELDOPS_KEY, // a browser key (so_pub_…): errors only
  endpoint: '${INGEST_URL}',
  environment: '${environment}',
  release: \`field-app@\${Application.nativeApplicationVersion}\`,
});

// Wrap the root so crashes in any screen are reported:
export default ShieldOps.wrap(App);`;
}

/** Run in CI after each deploy so errors and alerts can be traced to it. */
export function releaseSnippet() {
  return `curl -X POST ${INGEST_URL}/releases \\
  -H "Authorization: Bearer $SHIELDOPS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"version":"payments-api@'"$VERSION"'","commit":"'"$GITHUB_SHA"'","environment":"production"}'`;
}

export function probeSnippet(secret: string) {
  return `docker run -d --name shieldops-probe --restart unless-stopped \\
  -e SHIELDOPS_PROBE_TOKEN=${secret} \\
  -e SHIELDOPS_ENDPOINT=${INGEST_URL} \\
  ghcr.io/shieldops/probe:1`;
}