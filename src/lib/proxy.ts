export type ParsedProxy = {
  server: string;
  username?: string;
  password?: string;
};

const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_PORT_AUTH_PATTERN = /^([^:\s]+):(\d{2,5}):([^:]+):(.+)$/;
const AUTH_HOST_PORT_PATTERN = /^([^:@]+):([^@]+)@([^:\s]+):(\d{2,5})$/;
const HOST_PORT_PATTERN = /^([^:\s]+):(\d{2,5})$/;

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseUrlProxy(proxy: string): ParsedProxy | null {
  if (!PROTOCOL_PATTERN.test(proxy)) {
    return null;
  }

  try {
    const parsed = new URL(proxy);
    const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;

    return {
      server,
      username: parsed.username ? decode(parsed.username) : undefined,
      password: parsed.password ? decode(parsed.password) : undefined,
    };
  } catch {
    return null;
  }
}

export function parseProxyConfig(proxyUrl: string | null | undefined): ParsedProxy | undefined {
  const proxy = proxyUrl?.trim();
  if (!proxy) {
    return undefined;
  }

  const urlProxy = parseUrlProxy(proxy);
  if (urlProxy) {
    return urlProxy;
  }

  const hostPortAuth = HOST_PORT_AUTH_PATTERN.exec(proxy);
  if (hostPortAuth) {
    return {
      server: `http://${hostPortAuth[1]}:${hostPortAuth[2]}`,
      username: decode(hostPortAuth[3]),
      password: decode(hostPortAuth[4]),
    };
  }

  const authHostPort = AUTH_HOST_PORT_PATTERN.exec(proxy);
  if (authHostPort) {
    return {
      server: `http://${authHostPort[3]}:${authHostPort[4]}`,
      username: decode(authHostPort[1]),
      password: decode(authHostPort[2]),
    };
  }

  const hostPort = HOST_PORT_PATTERN.exec(proxy);
  if (hostPort) {
    return {
      server: `http://${hostPort[1]}:${hostPort[2]}`,
    };
  }

  return {
    server: proxy,
  };
}

export function maskProxy(proxyUrl: string | null | undefined) {
  const parsed = parseProxyConfig(proxyUrl);
  if (!parsed) {
    return "sem proxy";
  }

  try {
    const server = new URL(parsed.server);
    const auth = parsed.username ? `${parsed.username}:***@` : "";
    return `${server.protocol}//${auth}${server.hostname}${server.port ? `:${server.port}` : ""}`;
  } catch {
    return parsed.username
      ? parsed.server.replace(/:\/\/([^/]+)/, `://${parsed.username}:***@$1`)
      : parsed.server.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:***@");
  }
}
